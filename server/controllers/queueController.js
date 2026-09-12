const QueueEntry = require('../models/QueueEntry');
const Intake = require('../models/Intake');
const Department = require('../models/Department');
const User = require('../models/User');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { paginate } = require('../utils/helpers');
const { sortQueue, estimateWaitMinutes } = require('../services/queueService');
const { currentVersion, subscribe, bumpQueue } = require('../services/queueEvents');
const { writeAudit } = require('../middleware/audit');
const { notifyRoles, notifyUser } = require('../services/notifyService');

const listQueue = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, priority, department, search = '' } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.$or = [{ confirmedPriority: priority }, { suggestedPriority: priority }];
  if (department) filter.department = department;
  let items = await QueueEntry.find(filter)
    .populate('patient', 'patientId fullName phone')
    .populate('department', 'name code averageConsultMinutes')
    .populate('intake', 'visitId chiefComplaint status arrivalMethod')
    .sort({ isEscalated: -1, arrivalAt: 1 })
    .limit(500)
    .lean();
  // Server-side ordering: confirmed priority -> escalation -> arrival (admin-configurable default).
  items = sortQueue(items, req.query.strategy || req.app.get('queueStrategy') || 'clinical-first');
  if (search) {
    const s = search.toLowerCase();
    items = items.filter((e) => (e.token || '').toLowerCase().includes(s) || (e.patient && e.patient.fullName && e.patient.fullName.toLowerCase().includes(s)) || (e.intake && e.intake.visitId && e.intake.visitId.toLowerCase().includes(s)));
  }
  const total = items.length;
  const { skip, limit: lim, page: p } = paginate(req.query, { page, limit });
  const pageItems = items.slice(skip, skip + lim).map((e, i) => ({
    ...e,
    position: skip + i + 1,
    waitingMinutes: Math.max(0, Math.round((Date.now() - new Date(e.arrivalAt).getTime()) / 60000)),
    estimatedWaitMinutes: estimateWaitMinutes(skip + i, (e.department && e.department.averageConsultMinutes) || 15),
    // Receptionists and patients never receive clinical free-text via queue payload beyond what listIntakes allows.
    patient: req.user.role === 'patient' ? { patientId: e.patient?.patientId } : e.patient,
  }));
  return sendSuccess(res, { message: 'Patient queue.', data: pageItems, meta: { page: p, limit: lim, total, pages: Math.ceil(total / lim) } });
});

const escalate = asyncHandler(async (req, res) => {
  const entry = await QueueEntry.findOne({ intake: req.params.intakeId }).populate('intake');
  if (!entry) throw new HttpError(404, 'Queue entry not found.');
  entry.isEscalated = true;
  entry.escalatedAt = new Date();
  entry.status = 'escalated';
  await entry.save();
  await Intake.findByIdAndUpdate(entry.intake, { status: 'escalated', $push: { statusTimeline: { status: 'escalated', at: new Date(), by: req.user.id, note: req.body.reason || 'Escalated to doctor' } } });
  await writeAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'queue.escalate', entityType: 'Intake', entityId: entry.intake, metadata: { reason: req.body.reason || '' }, ip: req.ip });
  await notifyRoles(['doctor', 'admin'], { type: 'escalation', title: 'Emergency escalation', body: `Queue token ${entry.token} was escalated and needs immediate review.`, relatedIntake: entry.intake });
  bumpQueue('escalated');
  return sendSuccess(res, { message: 'Patient escalated. Emergency staff notified.', data: entry });
});

const assignClinician = asyncHandler(async (req, res) => {
  const { clinicianId, departmentId } = req.body;
  const entry = await QueueEntry.findOne({ intake: req.params.intakeId });
  if (!entry) throw new HttpError(404, 'Queue entry not found.');
  if (clinicianId) {
    const clinician = await User.findById(clinicianId).select('role isActive fullName');
    if (!clinician || clinician.isActive === false) throw new HttpError(404, 'Clinician not found or inactive.');
    if (!['doctor', 'nurse', 'admin'].includes(clinician.role)) throw new HttpError(422, 'Assignee must be a doctor, nurse, or admin.');
    entry.assignedClinician = clinicianId;
  }
  if (departmentId) {
    const dept = await Department.findById(departmentId);
    if (!dept) throw new HttpError(404, 'Department not found.');
    entry.department = departmentId;
  }
  entry.status = 'assigned';
  await entry.save();
  await Intake.findByIdAndUpdate(entry.intake, { assignedClinician: clinicianId || undefined, assignedDepartment: departmentId || undefined, status: 'assigned', $push: { statusTimeline: { status: 'assigned', at: new Date(), by: req.user.id, note: 'Assigned to clinician/department' } } });
  if (clinicianId) await notifyUser(clinicianId, { type: 'assignment', title: 'Patient assigned to you', body: `Queue token ${entry.token} is now assigned to you.`, relatedIntake: entry.intake });
  bumpQueue('assigned');
  return sendSuccess(res, { message: 'Patient assigned.', data: entry });
});

const streamQueue = asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event) => {
    try { res.write(`event: queue\ndata: ${JSON.stringify(event)}\n\n`); } catch { /* client gone */ }
  };
  send({ version: currentVersion(), reason: 'connected', at: new Date().toISOString() });
  const unsubscribe = subscribe(send);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* client gone */ } }, 20000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

module.exports = { listQueue, escalate, assignClinician, streamQueue };
