const Intake = require('../models/Intake');
const PatientProfile = require('../models/PatientProfile');
const SymptomEntry = require('../models/SymptomEntry');
const MedicalHistory = require('../models/MedicalHistory');
const QueueEntry = require('../models/QueueEntry');
const Department = require('../models/Department');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { paginate, visitId, queueToken, yearsBetween } = require('../utils/helpers');
const { writeAudit } = require('../middleware/audit');
const { notifyUser, notifyRoles } = require('../services/notifyService');
const { bumpQueue } = require('../services/queueEvents');

function pushTimeline(intake, status, by, note = '') {
  intake.statusTimeline.push({ status, at: new Date(), by: by || null, note });
}

async function resolvePatient(req, bodyPatient) {
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id });
    if (!own) throw new HttpError(404, 'Patient profile not found.');
    return own;
  }
  if (bodyPatient) {
    const p = await PatientProfile.findById(bodyPatient);
    if (!p) throw new HttpError(404, 'Patient not found.');
    return p;
  }
  throw new HttpError(422, 'Patient reference is required.');
}

async function assertIntakeWriteAccess(req, intake) {
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    const ownerId = String(intake.patient?._id || intake.patient || '');
    if (!own || String(own._id) !== ownerId) {
      throw new HttpError(403, 'You do not have permission to perform this action.');
    }
  }
}

function emptyToNull(v) {
  return v === '' || v === undefined ? null : v;
}

// POST /intakes — create draft intake (step 1+2 data accepted progressively)
const createIntake = asyncHandler(async (req, res) => {
  const patient = await resolvePatient(req, req.body.patient);
  const intake = await Intake.create({
    visitId: visitId(),
    patient: patient._id,
    createdBy: req.user.id,
    status: 'draft',
    demographics: {
      fullName: req.body.fullName || patient.fullName,
      dateOfBirth: req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : patient.dateOfBirth,
      gender: req.body.gender || patient.gender,
      bloodGroup: req.body.bloodGroup || patient.bloodGroup,
      phone: req.body.phone || patient.phone,
      email: req.body.email || patient.email,
      address: req.body.address ?? patient.address,
      preferredLanguage: req.body.preferredLanguage || patient.preferredLanguage,
      emergencyContactName: req.body.emergencyContactName ?? patient.emergencyContactName,
      emergencyContactRelationship: req.body.emergencyContactRelationship ?? patient.emergencyContactRelationship,
      emergencyContactPhone: req.body.emergencyContactPhone ?? patient.emergencyContactPhone,
    },
    arrivalMethod: req.body.arrivalMethod || 'walk-in',
    visitType: req.body.visitType || 'new',
    chiefComplaint: req.body.chiefComplaint || 'Not specified yet',
    departmentPreference: emptyToNull(req.body.departmentPreference),
    symptomOnsetAt: req.body.symptomOnsetAt ? new Date(req.body.symptomOnsetAt) : null,
    previousVisitRef: req.body.previousVisitRef || '',
    isEmergencyGuest: Boolean(req.body.isGuest),
  });
  pushTimeline(intake, 'draft', req.user.id, 'Draft created');
  await intake.save();
  await writeAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'intake.create', entityType: 'Intake', entityId: intake._id, ip: req.ip });
  return sendSuccess(res, { statusCode: 201, message: 'Intake draft created.', data: intake });
});

const listIntakes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, department, search = '', sort = '-createdAt' } = req.query;
  const { skip, limit: lim, page: p } = paginate(req.query, { page, limit });
  const filter = {};
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id });
    filter.patient = own ? own._id : null;
  }
  if (req.user.role === 'doctor') {
    // Doctors see assigned + escalated + awaiting review; admins/nurses/reception see broader sets.
    if (!status && !search) filter.status = { $in: ['awaiting-clinical-review', 'escalated', 'assigned', 'in-consultation'] };
  }
  if (status) filter.status = status;
  if (department) filter.assignedDepartment = department;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ visitId: rx }, { chiefComplaint: rx }];
  }
  const [items, total] = await Promise.all([
    Intake.find(filter).populate('patient', 'patientId fullName phone').populate('assignedDepartment', 'name code').sort(sort).skip(skip).limit(lim).lean(),
    Intake.countDocuments(filter),
  ]);
  // Receptionists get a non-clinical projection (no symptom free text beyond complaint).
  const data = req.user.role === 'receptionist'
    ? items.map(({ symptoms, medicalHistory, ...rest }) => rest)
    : items;
  return sendSuccess(res, { message: 'Intake requests.', data, meta: { page: p, limit: lim, total, pages: Math.ceil(total / lim) } });
});

const getIntake = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.params.id)
    .populate('patient')
    .populate('symptoms')
    .populate('medicalHistory')
    .populate('assignedDepartment')
    .populate('departmentPreference')
    .lean();
  if (!intake) throw new HttpError(404, 'Intake not found.');
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    if (!own || String(own._id) !== String(intake.patient._id)) throw new HttpError(403, 'You do not have permission to perform this action.');
  }
  if (req.user.role === 'receptionist') {
    delete intake.symptoms;
    delete intake.medicalHistory;
  }
  return sendSuccess(res, { message: 'Intake details.', data: intake });
});

// PUT /intakes/:id — update draft sections
const updateDraft = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.params.id);
  if (!intake) throw new HttpError(404, 'Intake not found.');
  await assertIntakeWriteAccess(req, intake);
  if (!['draft'].includes(intake.status) && req.user.role === 'patient' && intake.status !== 'draft') {
    throw new HttpError(409, 'This intake has already been submitted and can no longer be edited by the patient.');
  }
  const updatable = ['arrivalMethod', 'visitType', 'chiefComplaint', 'departmentPreference', 'symptomOnsetAt', 'previousVisitRef'];
  updatable.forEach((k) => {
    if (req.body[k] === undefined) return;
    if ((k === 'departmentPreference' || k === 'symptomOnsetAt') && req.body[k] === '') {
      intake[k] = null;
      return;
    }
    intake[k] = req.body[k];
  });
  if (req.body.demographics) intake.demographics = { ...intake.demographics, ...req.body.demographics };
  if (req.body.assignedDepartment && ['nurse', 'admin', 'doctor'].includes(req.user.role)) intake.assignedDepartment = req.body.assignedDepartment;
  if (req.body.status && ['nurse', 'doctor', 'admin', 'receptionist'].includes(req.user.role)) {
    intake.status = req.body.status;
    pushTimeline(intake, req.body.status, req.user.id, req.body.note || '');
  }
  await intake.save();
  return sendSuccess(res, { message: 'Intake updated.', data: intake });
});

// POST /intakes/:id/symptoms, /medical-history, /submit, documents
const saveSymptoms = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.params.id);
  if (!intake) throw new HttpError(404, 'Intake not found.');
  await assertIntakeWriteAccess(req, intake);
  const entry = await SymptomEntry.create({
    intake: intake._id,
    patient: intake.patient,
    symptoms: req.body.symptoms,
    duration: req.body.duration || '',
    durationHours: req.body.durationHours ?? null,
    severity: req.body.severity || 'moderate',
    painLevel: Number(req.body.painLevel),
    painLocation: req.body.painLocation || '',
    description: req.body.description || '',
    redFlags: req.body.redFlags || [],
    isWorsening: Boolean(req.body.isWorsening),
    recordedBy: req.user.id,
  });
  intake.symptoms.push(entry._id);
  await intake.save();
  return sendSuccess(res, { statusCode: 201, message: 'Symptoms recorded.', data: entry });
});

const saveHistory = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.params.id);
  if (!intake) throw new HttpError(404, 'Intake not found.');
  await assertIntakeWriteAccess(req, intake);
  const doc = await MedicalHistory.create({
    intake: intake._id,
    patient: intake.patient,
    conditions: req.body.conditions || [],
    previousSurgeries: req.body.previousSurgeries || [],
    pregnancyStatus: req.body.pregnancyStatus || 'not-applicable',
    allergies: req.body.allergies || [],
    medications: req.body.medications || [],
    recentHospitalization: req.body.recentHospitalization || '',
    familyHistory: req.body.familyHistory || '',
    communicableScreening: req.body.communicableScreening || {},
    recordedBy: req.user.id,
  });
  intake.medicalHistory = doc._id;
  await intake.save();
  return sendSuccess(res, { statusCode: 201, message: 'Medical background recorded.', data: doc });
});

const submitIntake = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.params.id).populate('patient');
  if (!intake) throw new HttpError(404, 'Intake not found.');
  await assertIntakeWriteAccess(req, intake);
  if (!['draft', 'submitted'].includes(intake.status)) throw new HttpError(409, 'Only draft intakes can be submitted.');
  // Symptoms are optional at submit time: staff record them via the symptoms API.
  // Intakes without symptoms triage as Unclassified and go straight to staff review.
  if (req.body.dataProcessing !== true && req.body.dataProcessing !== 'true') throw new HttpError(422, 'Data-processing consent is required.');
  if (req.body.accuracyConfirmed !== true && req.body.accuracyConfirmed !== 'true') throw new HttpError(422, 'Accuracy confirmation is required.');
  intake.consent = { dataProcessing: true, accuracyConfirmed: true, consentedAt: new Date() };
  intake.status = 'awaiting-triage';
  if (!intake.assignedDepartment && intake.departmentPreference) intake.assignedDepartment = intake.departmentPreference;
  pushTimeline(intake, 'awaiting-triage', req.user.id, 'Submitted to triage queue');
  await intake.save();
  const dept = intake.assignedDepartment ? await Department.findById(intake.assignedDepartment).lean() : null;
  let queue = await QueueEntry.findOne({ intake: intake._id });
  if (!queue) {
    queue = await QueueEntry.create({
      intake: intake._id,
      patient: intake.patient._id || intake.patient,
      token: queueToken(dept ? dept.code : 'GEN'),
      department: intake.assignedDepartment || null,
      status: 'awaiting-triage',
      arrivalAt: new Date(),
    });
  }
  await writeAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'intake.submit', entityType: 'Intake', entityId: intake._id, ip: req.ip });
  await notifyRoles(['nurse', 'admin'], { type: 'triage-ready', title: 'Patient ready for triage', body: `Visit ${intake.visitId} is awaiting triage.`, relatedIntake: intake._id });
  bumpQueue('intake-submitted');
  return sendSuccess(res, { message: 'Intake submitted successfully.', data: { intake, queue } });
});

const addDocuments = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.params.id);
  if (!intake) throw new HttpError(404, 'Intake not found.');
  await assertIntakeWriteAccess(req, intake);
  const files = (req.files || []).map((f) => ({ filename: f.filename, originalName: f.originalname, mime: f.mimetype, size: f.size, uploadedAt: new Date() }));
  intake.documents.push(...files);
  await intake.save();
  return sendSuccess(res, { message: 'Documents uploaded.', data: intake.documents });
});

module.exports = { createIntake, listIntakes, getIntake, updateDraft, saveSymptoms, saveHistory, submitIntake, addDocuments, yearsBetween };
