const Intake = require('../models/Intake');
const TriageAssessment = require('../models/TriageAssessment');
const VitalSigns = require('../models/VitalSigns');
const SymptomEntry = require('../models/SymptomEntry');
const MedicalHistory = require('../models/MedicalHistory');
const QueueEntry = require('../models/QueueEntry');
const ClinicalReview = require('../models/ClinicalReview');
const AuditLog = require('../models/AuditLog');
const PatientProfile = require('../models/PatientProfile');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { toCsv } = require('../services/reportService');
const { buildIntakePdf } = require('../services/pdfService');
const config = require('../config/env');

const DISCLAIMER = 'PatientFlow provides workflow support and a suggested triage priority only. It does not diagnose, prescribe, or replace a qualified healthcare professional. All priorities require clinical review.';

async function buildIntakeSummary(intakeId) {
  const intake = await Intake.findById(intakeId).populate('patient').populate('assignedDepartment').populate('departmentPreference').lean();
  if (!intake) throw new HttpError(404, 'Intake not found.');
  const [symptoms, history, vitals, triage, reviews, queue] = await Promise.all([
    SymptomEntry.find({ intake: intakeId }).sort('-createdAt').lean(),
    MedicalHistory.findOne({ intake: intakeId }).lean(),
    VitalSigns.find({ intake: intakeId }).sort('recordedAt').populate('recordedBy', 'fullName role').lean(),
    TriageAssessment.find({ intake: intakeId }).sort('-createdAt').populate('assessedBy', 'fullName role').populate('confirmedBy', 'fullName role').lean(),
    ClinicalReview.find({ intake: intakeId }).sort('-reviewedAt').populate('reviewer', 'fullName role').lean(),
    QueueEntry.findOne({ intake: intakeId }).lean(),
  ]);
  return { intake, symptoms, history, vitals, triage, reviews, queue, disclaimer: DISCLAIMER, generatedAt: new Date() };
}

async function loadSummaryForRequest(req) {
  const data = await buildIntakeSummary(req.params.id);
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    const ownerId = String(data.intake.patient?._id || data.intake.patient || '');
    if (!own || String(own._id) !== ownerId) throw new HttpError(403, 'You do not have permission to perform this action.');
  }
  if (req.user.role === 'receptionist') {
    delete data.history;
    if (data.intake) delete data.intake.documents;
  }
  return data;
}

const intakeSummary = asyncHandler(async (req, res) => {
  const data = await loadSummaryForRequest(req);
  return sendSuccess(res, { message: 'Patient intake summary.', data });
});

const intakePdf = asyncHandler(async (req, res) => {
  const data = await loadSummaryForRequest(req);
  const pdf = await buildIntakePdf(data, config.hospitalName);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="intake-${data.intake.visitId}.pdf"`);
  res.setHeader('Content-Length', pdf.length);
  return res.send(pdf);
});

const dailyReport = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const day = date ? new Date(date) : new Date();
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(day); end.setHours(23, 59, 59, 999);
  const intakes = await Intake.find({ createdAt: { $gte: start, $lte: end } }).populate('patient', 'patientId fullName').populate('assignedDepartment', 'name code').sort('createdAt').lean();
  const byStatus = {};
  intakes.forEach((i) => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });
  return sendSuccess(res, { message: 'Daily patient report.', data: { date: start.toISOString().slice(0, 10), total: intakes.length, byStatus, intakes, disclaimer: DISCLAIMER } });
});

const priorityDistribution = asyncHandler(async (req, res) => {
  const agg = await TriageAssessment.aggregate([
    { $group: { _id: { $ifNull: ['$confirmedPriority', '$suggestedPriority'] }, count: { $sum: 1 } } },
  ]);
  return sendSuccess(res, { message: 'Priority distribution.', data: { distribution: agg, disclaimer: DISCLAIMER } });
});

const departmentWorkload = asyncHandler(async (req, res) => {
  const agg = await QueueEntry.aggregate([
    { $group: { _id: '$department', count: { $sum: 1 }, escalated: { $sum: { $cond: ['$isEscalated', 1, 0] } } } },
  ]);
  return sendSuccess(res, { message: 'Department workload.', data: agg });
});

const waitingTimeReport = asyncHandler(async (req, res) => {
  const entries = await QueueEntry.find().populate('department', 'name code').lean();
  const waits = entries.map((e) => Math.max(0, Math.round((Date.now() - new Date(e.arrivalAt).getTime()) / 60000)));
  const avg = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;
  return sendSuccess(res, { message: 'Waiting-time report.', data: { averageWaitingMinutes: avg, samples: waits.length, entries: entries.slice(0, 200) } });
});

const auditReport = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, entityType, from, to } = req.query;
  const filter = {};
  if (action) filter.action = new RegExp(action, 'i');
  if (entityType) filter.entityType = entityType;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10) || 50);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'fullName email role').sort('-createdAt').skip(skip).limit(Math.min(100, parseInt(limit, 10) || 50)).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return sendSuccess(res, { message: 'Audit report.', data: items, meta: { total } });
});

const exportCsv = asyncHandler(async (req, res) => {
  const { type = 'daily' } = req.params;
  if (type === 'daily') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const intakes = await Intake.find({ createdAt: { $gte: start } }).populate('patient', 'patientId fullName').lean();
    const csv = toCsv(intakes, [
      { header: 'visitId', key: 'visitId' },
      { header: 'patient', value: (r) => (r.patient ? r.patient.patientId : '') },
      { header: 'status', key: 'status' },
      { header: 'chiefComplaint', key: 'chiefComplaint' },
      { header: 'createdAt', value: (r) => new Date(r.createdAt).toISOString() },
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="daily-report.csv"');
    return res.send(csv);
  }
  if (type === 'queue') {
    const entries = await QueueEntry.find().populate('patient', 'patientId').populate('intake', 'visitId').lean();
    const csv = toCsv(entries, [
      { header: 'token', key: 'token' },
      { header: 'visit', value: (r) => (r.intake ? r.intake.visitId : '') },
      { header: 'suggestedPriority', key: 'suggestedPriority' },
      { header: 'confirmedPriority', key: 'confirmedPriority' },
      { header: 'status', key: 'status' },
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="queue-report.csv"');
    return res.send(csv);
  }
  throw new HttpError(404, 'Unknown export type.');
});

const exportAuditCsv = asyncHandler(async (req, res) => {
  const { action, entityType, from, to } = req.query;
  const filter = {};
  if (action) filter.action = new RegExp(action, 'i');
  if (entityType) filter.entityType = entityType;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const items = await AuditLog.find(filter).populate('actor', 'fullName email role').sort('-createdAt').limit(2000).lean();
  const csv = toCsv(items, [
    { header: 'at', value: (r) => new Date(r.createdAt).toISOString() },
    { header: 'action', key: 'action' },
    { header: 'actor', value: (r) => (r.actor ? r.actor.email : '') },
    { header: 'actorName', value: (r) => (r.actor ? r.actor.fullName : '') },
    { header: 'actorRole', value: (r) => r.actorRole || (r.actor ? r.actor.role : '') },
    { header: 'entityType', value: (r) => r.entityType || '' },
    { header: 'entityId', value: (r) => r.entityId || '' },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-report.csv"');
  return res.send(csv);
});

module.exports = { intakeSummary, intakePdf, dailyReport, priorityDistribution, departmentWorkload, waitingTimeReport, auditReport, exportCsv, exportAuditCsv, DISCLAIMER };
