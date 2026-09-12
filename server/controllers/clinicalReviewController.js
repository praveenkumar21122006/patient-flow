const ClinicalReview = require('../models/ClinicalReview');
const Intake = require('../models/Intake');
const QueueEntry = require('../models/QueueEntry');
const PatientProfile = require('../models/PatientProfile');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { writeAudit } = require('../middleware/audit');
const { notifyUser, notifyFromTemplate, templateOverrides } = require('../services/notifyService');
const { bumpQueue } = require('../services/queueEvents');

const listReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.intake) filter.intake = req.query.intake;
  const items = await ClinicalReview.find(filter).populate('reviewer', 'fullName role').sort('-reviewedAt').limit(200).lean();
  return sendSuccess(res, { message: 'Clinical reviews.', data: items });
});

const addReview = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.body.intake);
  if (!intake) throw new HttpError(404, 'Intake not found.');
  const review = await ClinicalReview.create({
    intake: intake._id,
    patient: intake.patient,
    reviewer: req.user.id,
    summary: req.body.summary || '',
    reviewNotes: req.body.reviewNotes,
    newStatus: req.body.newStatus || null,
    acknowledgedEmergency: Boolean(req.body.acknowledgedEmergency),
    reviewedAt: new Date(),
  });
  if (req.body.newStatus) {
    intake.status = req.body.newStatus;
    intake.statusTimeline.push({ status: req.body.newStatus, at: new Date(), by: req.user.id, note: 'Clinical review' });
    await intake.save();
    await QueueEntry.findOneAndUpdate({ intake: intake._id }, { status: req.body.newStatus });
    bumpQueue('status-changed');
  }
  await writeAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'clinical.review', entityType: 'Intake', entityId: intake._id, ip: req.ip });
  // Notify the patient (status changed) and the assigned clinician (queue update).
  // Bodies carry identifiers only — never clinical content.
  try {
    const overrides = templateOverrides(req.app);
    const profile = await PatientProfile.findById(intake.patient).select('user').lean();
    if (profile && profile.user) {
      await notifyFromTemplate(profile.user, req.body.newStatus ? 'consultation-status' : 'queue-update',
        { visitId: intake.visitId, status: req.body.newStatus || intake.status }, { relatedIntake: intake._id, overrides });
    }
    if (intake.assignedClinician && String(intake.assignedClinician) !== String(req.user.id)) {
      await notifyFromTemplate(intake.assignedClinician, 'queue-update',
        { visitId: intake.visitId, status: req.body.newStatus || intake.status }, { relatedIntake: intake._id, overrides });
    }
  } catch { /* notifications must never break the clinical workflow */ }
  return sendSuccess(res, { statusCode: 201, message: 'Clinical review saved. This note does not constitute an automated diagnosis.', data: review });
});

module.exports = { listReviews, addReview };
