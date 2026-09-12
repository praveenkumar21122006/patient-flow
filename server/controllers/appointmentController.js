const Appointment = require('../models/Appointment');
const { ACTIVE_APPT_STATUS } = require('../models/Appointment');
const PatientProfile = require('../models/PatientProfile');
const Department = require('../models/Department');
const User = require('../models/User');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { paginate, apptId } = require('../utils/helpers');
const { writeAudit } = require('../middleware/audit');
const { notifyFromTemplate, templateOverrides } = require('../services/notifyService');

// Allowed status transitions; terminal states close the booking.
const TRANSITIONS = {
  scheduled: ['checked-in', 'cancelled', 'no-show'],
  'checked-in': ['in-consultation', 'cancelled', 'no-show'],
  'in-consultation': ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  'no-show': [],
};

async function resolveBookingPatient(req) {
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id });
    if (!own) throw new HttpError(404, 'Patient profile not found.');
    return own;
  }
  if (!req.body.patient) throw new HttpError(422, 'Patient reference is required.');
  const p = await PatientProfile.findById(req.body.patient);
  if (!p) throw new HttpError(404, 'Patient not found.');
  return p;
}

async function assertBookingAccess(req, appt) {
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    if (!own || String(appt.patient) !== String(own._id)) {
      throw new HttpError(403, 'You do not have permission to perform this action.');
    }
  }
}

async function validateRefs(departmentId, clinicianId) {
  const dept = departmentId ? await Department.findById(departmentId).lean() : null;
  if (departmentId && !dept) throw new HttpError(404, 'Department not found.');
  let clinician = null;
  if (clinicianId) {
    clinician = await User.findById(clinicianId).select('role isActive fullName');
    if (!clinician || clinician.isActive === false) throw new HttpError(404, 'Clinician not found or inactive.');
    if (!['doctor', 'nurse'].includes(clinician.role)) throw new HttpError(422, 'Clinician must be a doctor or nurse.');
  }
  return { dept, clinician };
}

async function hasOverlap(patientId, startMs, endMs, excludeId = null) {
  const filter = { patient: patientId, status: { $in: ACTIVE_APPT_STATUS } };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await Appointment.find(filter).select('scheduledAt durationMinutes').lean();
  return existing.some((a) => {
    const s = new Date(a.scheduledAt).getTime();
    const e = s + (a.durationMinutes || 30) * 60000;
    return s < endMs && e > startMs;
  });
}

const listAppointments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, department, patient, upcoming, from, to, sort = 'scheduledAt' } = req.query;
  const { skip, limit: lim, page: p } = paginate(req.query, { page, limit });
  const filter = {};
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    filter.patient = own ? own._id : null;
  } else if (patient) filter.patient = patient;
  if (status) filter.status = status;
  if (department) filter.department = department;
  if (upcoming === 'true') filter.scheduledAt = { $gte: new Date() };
  else if (upcoming === 'false') filter.scheduledAt = { $lt: new Date() };
  if (from || to) {
    filter.scheduledAt = filter.scheduledAt || {};
    if (from) filter.scheduledAt.$gte = new Date(from);
    if (to) filter.scheduledAt.$lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    Appointment.find(filter)
      .populate('patient', 'patientId fullName phone')
      .populate('department', 'name code')
      .populate('clinician', 'fullName role')
      .sort(sort).skip(skip).limit(lim).lean(),
    Appointment.countDocuments(filter),
  ]);
  return sendSuccess(res, { message: 'Appointments.', data: items, meta: { page: p, limit: lim, total, pages: Math.ceil(total / lim) } });
});

const createAppointment = asyncHandler(async (req, res) => {
  const patient = await resolveBookingPatient(req);
  const { dept } = await validateRefs(req.body.department, req.body.clinician);
  const startMs = new Date(req.body.scheduledAt).getTime();
  const duration = Number(req.body.durationMinutes) || 30;
  if (await hasOverlap(patient._id, startMs, startMs + duration * 60000)) {
    throw new HttpError(409, 'This patient already has an active booking overlapping that time.');
  }
  const appt = await Appointment.create({
    appointmentId: apptId(),
    patient: patient._id,
    department: dept._id,
    clinician: req.body.clinician || null,
    scheduledAt: new Date(req.body.scheduledAt),
    durationMinutes: duration,
    reason: req.body.reason,
    notes: req.body.notes || '',
    createdBy: req.user.id,
  });
  await writeAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'appointment.create', entityType: 'Appointment', entityId: appt._id, ip: req.ip });
  try {
    const overrides = templateOverrides(req.app);
    const owner = await PatientProfile.findById(patient._id).select('user').lean();
    if (owner && owner.user) {
      await notifyFromTemplate(owner.user, 'appointment-booked', { visitId: appt.appointmentId, status: dept.name }, { relatedIntake: null, overrides });
    }
    if (appt.clinician) {
      await notifyFromTemplate(appt.clinician, 'appointment-booked', { visitId: appt.appointmentId, status: dept.name }, { relatedIntake: null, overrides });
    }
  } catch { /* notifications must never break booking */ }
  return sendSuccess(res, { statusCode: 201, message: 'Appointment booked.', data: appt });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) throw new HttpError(404, 'Appointment not found.');
  await assertBookingAccess(req, appt);

  // Patients may only cancel their own bookings.
  if (req.user.role === 'patient') {
    const keys = Object.keys(req.body).filter((k) => k !== 'cancelReason');
    if (keys.length !== 1 || keys[0] !== 'status' || req.body.status !== 'cancelled') {
      throw new HttpError(403, 'Patients may only cancel their own appointments. Contact reception for other changes.');
    }
  }

  if (req.body.status && req.body.status !== appt.status) {
    if (!TRANSITIONS[appt.status].includes(req.body.status)) {
      throw new HttpError(409, `Cannot move an appointment from ${appt.status} to ${req.body.status}.`);
    }
    appt.status = req.body.status;
    if (req.body.status === 'checked-in') appt.checkedInAt = new Date();
    if (req.body.status === 'completed') appt.completedAt = new Date();
    if (req.body.status === 'cancelled') {
      appt.cancelledAt = new Date();
      appt.cancelReason = req.body.cancelReason || '';
    }
  }
  if (req.body.scheduledAt) {
    if (['completed', 'cancelled', 'no-show'].includes(appt.status)) throw new HttpError(409, 'Closed appointments cannot be rescheduled. Book a new appointment instead.');
    const startMs = new Date(req.body.scheduledAt).getTime();
    const duration = Number(req.body.durationMinutes) || appt.durationMinutes;
    if (await hasOverlap(appt.patient, startMs, startMs + duration * 60000, appt._id)) {
      throw new HttpError(409, 'This patient already has an active booking overlapping that time.');
    }
    appt.scheduledAt = new Date(req.body.scheduledAt);
  }
  if (req.body.department || req.body.clinician !== undefined) {
    const { dept, clinician } = await validateRefs(req.body.department || appt.department, req.body.clinician === '' ? null : (req.body.clinician ?? appt.clinician));
    if (dept) appt.department = dept._id;
    appt.clinician = clinician ? clinician._id : (req.body.clinician === '' ? null : appt.clinician);
  }
  if (req.body.durationMinutes) appt.durationMinutes = Number(req.body.durationMinutes);
  if (req.body.notes !== undefined) appt.notes = String(req.body.notes).slice(0, 2000);
  if (req.body.cancelReason !== undefined && appt.status === 'cancelled') appt.cancelReason = String(req.body.cancelReason).slice(0, 500);
  await appt.save();
  await writeAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'appointment.update', entityType: 'Appointment', entityId: appt._id, metadata: { status: appt.status }, ip: req.ip });
  if (appt.status === 'cancelled') {
    try {
      const overrides = templateOverrides(req.app);
      const owner = await PatientProfile.findById(appt.patient).select('user').lean();
      if (owner && owner.user) {
        await notifyFromTemplate(owner.user, 'appointment-cancelled', { visitId: appt.appointmentId, status: appt.status }, { relatedIntake: null, overrides });
      }
    } catch { /* notifications must never break the workflow */ }
  }
  return sendSuccess(res, { message: 'Appointment updated.', data: appt });
});

module.exports = { listAppointments, createAppointment, updateAppointment };
