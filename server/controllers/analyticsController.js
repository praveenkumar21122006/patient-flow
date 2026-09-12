const Intake = require('../models/Intake');
const QueueEntry = require('../models/QueueEntry');
const User = require('../models/User');
const TriageAssessment = require('../models/TriageAssessment');
const ClinicalReview = require('../models/ClinicalReview');
const AuditLog = require('../models/AuditLog');
const SymptomEntry = require('../models/SymptomEntry');
const Department = require('../models/Department');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler } = require('../utils/asyncHandler');

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

const overview = asyncHandler(async (req, res) => {
  const today = startOfDay(new Date());
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const [totalVisits, todayVisits, activeStaff, awaitingTriage, criticalQueue, urgentQueue, assignedCount, awaitingReview, completed, escalated, avgWaitSample] = await Promise.all([
    Intake.countDocuments(),
    Intake.countDocuments({ createdAt: { $gte: today } }),
    User.countDocuments({ isActive: true, role: { $in: ['receptionist', 'nurse', 'doctor', 'admin'] } }),
    QueueEntry.countDocuments({ status: { $in: ['awaiting-triage', 'triage-in-progress'] } }),
    QueueEntry.countDocuments({ $or: [{ confirmedPriority: 'critical' }, { suggestedPriority: 'critical' }], status: { $nin: ['completed', 'cancelled'] } }),
    QueueEntry.countDocuments({ $or: [{ confirmedPriority: 'urgent' }, { suggestedPriority: 'urgent' }], status: { $nin: ['completed', 'cancelled'] } }),
    QueueEntry.countDocuments({ status: 'assigned' }),
    Intake.countDocuments({ status: 'awaiting-clinical-review' }),
    Intake.countDocuments({ status: 'completed' }),
    QueueEntry.countDocuments({ isEscalated: true, status: { $nin: ['completed', 'cancelled'] } }),
    QueueEntry.find({ status: { $nin: ['completed', 'cancelled'] } }).select('arrivalAt').limit(200).lean(),
  ]);
  const waits = avgWaitSample.map((e) => Math.max(0, Math.round((Date.now() - new Date(e.arrivalAt).getTime()) / 60000)));
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  // Average triage duration: intake creation -> first assessment (minutes, sampled).
  let avgTriageMinutes = null;
  try {
    const samples = await TriageAssessment.aggregate([
      { $sort: { assessedAt: -1 } },
      { $limit: 100 },
      { $lookup: { from: 'intakes', localField: 'intake', foreignField: '_id', as: 'iv' } },
      { $unwind: '$iv' },
      { $project: { mins: { $divide: [{ $subtract: ['$assessedAt', '$iv.createdAt'] }, 60000] } } },
      { $match: { mins: { $gte: 0, $lte: 1440 } } },
      { $group: { _id: null, avg: { $avg: '$mins' } } },
    ]);
    if (samples.length && samples[0].avg != null) avgTriageMinutes = Math.round(samples[0].avg);
  } catch { /* analytics must never fail the dashboard */ }

  // Department workload enriched with names.
  const workloadRaw = await QueueEntry.aggregate([
    { $match: { status: { $nin: ['completed', 'cancelled'] } } },
    { $group: { _id: '$department', count: { $sum: 1 }, escalated: { $sum: { $cond: ['$isEscalated', 1, 0] } } } },
  ]);
  const deptIds = workloadRaw.filter((w) => w._id).map((w) => w._id);
  const deptDocs = deptIds.length ? await Department.find({ _id: { $in: deptIds } }).select('name code').lean() : [];
  const deptById = Object.fromEntries(deptDocs.map((d) => [String(d._id), d]));
  const workload = workloadRaw.map((w) => ({ ...w, department: w._id ? deptById[String(w._id)] || null : null }));

  // Open red-flag alerts (symptom entries with flags on active intakes).
  const redFlagCases = await SymptomEntry.countDocuments({ redFlags: { $exists: true, $not: { $size: 0 } } });

  const priorityAgg = await TriageAssessment.aggregate([{ $group: { _id: { $ifNull: ['$confirmedPriority', '$suggestedPriority'] }, count: { $sum: 1 } } }]);
  const trend = await Intake.aggregate([
    { $match: { createdAt: { $gte: weekAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const peakHours = await Intake.aggregate([
    { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  const recentAudit = await AuditLog.find().sort('-createdAt').limit(8).lean();
  const recentReviews = await ClinicalReview.find().populate('reviewer', 'fullName role').sort('-reviewedAt').limit(6).lean();

  return sendSuccess(res, {
    message: 'Operational analytics.',
    data: {
      cards: { totalVisits, todayVisits, activeStaff, awaitingTriage, criticalQueue, urgentQueue, assignedCount, awaitingReview, completed, escalated, avgWait, avgTriageMinutes, redFlagCases },
      priorityDistribution: priorityAgg,
      weeklyTrend: trend,
      peakHours,
      workload,
      recentAudit: recentAudit.map((a) => ({ action: a.action, at: a.createdAt, actorRole: a.actorRole })),
      recentReviews,
    },
  });
});

module.exports = { overview };
