const TriageAssessment = require('../models/TriageAssessment');
const Intake = require('../models/Intake');
const SymptomEntry = require('../models/SymptomEntry');
const MedicalHistory = require('../models/MedicalHistory');
const VitalSigns = require('../models/VitalSigns');
const QueueEntry = require('../models/QueueEntry');
const PatientProfile = require('../models/PatientProfile');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { evaluateTriage, RULE_VERSION } = require('../services/triageEngine');
const { writeAudit } = require('../middleware/audit');
const { notifyUser, notifyRoles } = require('../services/notifyService');
const { bumpQueue } = require('../services/queueEvents');

async function gatherContext(intakeId) {
  const intake = await Intake.findById(intakeId).populate('patient').lean();
  if (!intake) throw new HttpError(404, 'Intake not found.');
  const [symptoms, history, vitals] = await Promise.all([
    SymptomEntry.find({ intake: intakeId }).sort('-createdAt').lean().then((r) => r[0] || null),
    MedicalHistory.findOne({ intake: intakeId }).lean(),
    VitalSigns.find({ intake: intakeId }).sort('-recordedAt').lean().then((r) => r[0] || null),
  ]);
  return { intake, symptoms, history, vitals };
}

const runAssessment = asyncHandler(async (req, res) => {
  const { intake: intakeId, triageNotes = '' } = req.body;
  const { intake, symptoms, history, vitals } = await gatherContext(intakeId);
  const result = evaluateTriage({
    symptomEntry: symptoms,
    vitals,
    demographics: intake.demographics || intake.patient || {},
    history,
    arrivalMethod: intake.arrivalMethod,
  });
  const assessment = await TriageAssessment.create({
    intake: intake._id,
    patient: intake.patient._id || intake.patient,
    ruleVersion: result.ruleVersion,
    suggestedPriority: result.suggestedPriority,
    matchedRules: result.matchedRules,
    riskIndicators: result.riskIndicators,
    explanation: result.explanation,
    score: result.score,
    triageNotes,
    assessedBy: req.user.id,
    assessedAt: new Date(),
    status: 'suggested',
  });
  await Intake.findByIdAndUpdate(intake._id, { status: 'awaiting-clinical-review', $push: { statusTimeline: { status: 'awaiting-clinical-review', at: new Date(), by: req.user.id, note: 'Triage suggestion generated' } } });
  await QueueEntry.findOneAndUpdate({ intake: intake._id }, { suggestedPriority: result.suggestedPriority, status: 'awaiting-clinical-review' });
  await writeAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'triage.suggest', entityType: 'TriageAssessment', entityId: assessment._id, metadata: { suggested: result.suggestedPriority, ruleVersion: RULE_VERSION }, ip: req.ip });
  if (result.suggestedPriority === 'critical') {
    await notifyRoles(['doctor', 'nurse', 'admin'], { type: 'critical-case', title: 'Critical case detected', body: `Visit ${intake.visitId} received a critical suggestion. Clinical review required.`, relatedIntake: intake._id });
  }
  return sendSuccess(res, { statusCode: 201, message: 'Triage suggestion generated. Requires clinical review.', data: assessment });
});

const confirmAssessment = asyncHandler(async (req, res) => {
  const assessment = await TriageAssessment.findById(req.params.id).populate('intake');
  if (!assessment) throw new HttpError(404, 'Assessment not found.');
  if (assessment.status !== 'suggested') throw new HttpError(409, 'This assessment has already been confirmed.');
  const { confirmedPriority, overrideReason = '', triageNotes = '' } = req.body;
  const isOverride = confirmedPriority !== assessment.suggestedPriority;
  if (isOverride && !String(overrideReason).trim()) {
    throw new HttpError(422, 'An override reason is mandatory when changing the suggested priority.');
  }
  assessment.confirmedPriority = confirmedPriority;
  assessment.confirmedBy = req.user.id;
  assessment.confirmedAt = new Date();
  assessment.overrideReason = isOverride ? String(overrideReason) : '';
  if (triageNotes) assessment.triageNotes = triageNotes;
  assessment.status = isOverride ? 'overridden' : 'confirmed';
  await assessment.save();
  await Intake.findByIdAndUpdate(assessment.intake, { status: 'assigned', $push: { statusTimeline: { status: 'assigned', at: new Date(), by: req.user.id, note: isOverride ? `Priority overridden to ${confirmedPriority}: ${overrideReason}` : `Priority confirmed: ${confirmedPriority}` } } });
  await QueueEntry.findOneAndUpdate({ intake: assessment.intake }, { confirmedPriority, status: 'assigned' });
  await writeAudit({
    actorId: req.user.id, actorRole: req.user.role,
    action: isOverride ? 'triage.override' : 'triage.confirm',
    entityType: 'TriageAssessment', entityId: assessment._id,
    metadata: { suggested: assessment.suggestedPriority, confirmed: confirmedPriority, reason: assessment.overrideReason },
    ip: req.ip,
  });
  if (isOverride) {
    await notifyRoles(['admin', 'doctor'], { type: 'priority-override', title: 'Triage priority overridden', body: `Suggestion ${assessment.suggestedPriority} changed to ${confirmedPriority}. Reason recorded.`, relatedIntake: assessment.intake });
  }
  bumpQueue(isOverride ? 'triage-overridden' : 'triage-confirmed');
  return sendSuccess(res, { message: isOverride ? 'Priority overridden with reason recorded.' : 'Priority confirmed.', data: assessment });
});

const listAssessments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.intake) filter.intake = req.query.intake;
  if (req.query.status) filter.status = req.query.status;
  if (req.user.role === 'patient') {
    // Patients may only view assessments for their own intakes.
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    if (!own) throw new HttpError(404, 'Patient profile not found.');
    if (filter.intake) {
      const parent = await Intake.findById(filter.intake).select('patient').lean();
      if (!parent || String(parent.patient) !== String(own._id)) throw new HttpError(403, 'You do not have permission to perform this action.');
    } else {
      filter.patient = own._id;
    }
  }
  const items = await TriageAssessment.find(filter).populate('assessedBy', 'fullName role').populate('confirmedBy', 'fullName role').sort('-createdAt').limit(100).lean();
  return sendSuccess(res, { message: 'Triage assessments.', data: items });
});

module.exports = { runAssessment, confirmAssessment, listAssessments, gatherContext };
