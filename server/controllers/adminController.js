const TriageRule = require('../models/TriageRule');
const AuditLog = require('../models/AuditLog');
const { RULES, RULE_VERSION } = require('../services/triageEngine');
const { DEFAULT_TEMPLATES } = require('../services/notificationTemplates');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { paginate } = require('../utils/helpers');

const listRules = asyncHandler(async (req, res) => {
  const rules = await TriageRule.find().sort('ruleId').lean();
  return sendSuccess(res, { message: 'Triage rule configuration.', data: { version: RULE_VERSION, rules: rules.length ? rules : RULES, note: 'Demo thresholds only — require clinical governance validation before real-world use.' } });
});

const syncRules = asyncHandler(async (req, res) => {
  for (const r of RULES) {
    await TriageRule.findOneAndUpdate({ ruleId: r.ruleId }, { ...r, version: RULE_VERSION }, { upsert: true });
  }
  return sendSuccess(res, { message: 'Rule catalogue synchronized.', data: { version: RULE_VERSION, count: RULES.length } });
});

const updateRule = asyncHandler(async (req, res) => {
  let rule = await TriageRule.findOne({ ruleId: req.params.ruleId });
  if (!rule) {
    // Fresh installs may not have synced the catalogue yet: materialize the
    // known rule before patching instead of failing with 404.
    const base = RULES.find((x) => x.ruleId === req.params.ruleId);
    if (!base) throw new HttpError(404, 'Rule not found.');
    rule = new TriageRule({ ...base, version: RULE_VERSION });
  }
  if (req.body.points !== undefined) rule.points = Math.max(0, Math.min(100, Number(req.body.points)));
  if (req.body.isActive !== undefined) rule.isActive = Boolean(req.body.isActive);
  if (req.body.description !== undefined) rule.description = String(req.body.description).slice(0, 1000);
  await rule.save();
  return sendSuccess(res, { message: 'Rule updated.', data: rule });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, action, entityType, from, to } = req.query;
  const { skip, limit: lim, page: p } = paginate(req.query, { page, limit });
  const filter = {};
  if (action) filter.action = new RegExp(action, 'i');
  if (entityType) filter.entityType = entityType;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'fullName email role').sort('-createdAt').skip(skip).limit(lim).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return sendSuccess(res, { message: 'Audit events (immutable).', data: items, meta: { page: p, limit: lim, total, pages: Math.ceil(total / lim) } });
});

const updateSettings = asyncHandler(async (req, res) => {
  // Allowed upload types + retention + default queue strategy are operator-configurable.
  const { allowedMime, retentionDays, queueStrategy } = req.body;
  if (allowedMime) req.app.set('uploadAllowedMime', allowedMime);
  if (retentionDays !== undefined) req.app.set('uploadRetentionDays', Math.max(1, Math.min(3650, Number(retentionDays) || 90)));
  if (queueStrategy !== undefined) {
    if (!['clinical-first', 'arrival-only'].includes(queueStrategy)) throw new HttpError(422, 'Queue strategy must be clinical-first or arrival-only.');
    req.app.set('queueStrategy', queueStrategy);
  }
  return sendSuccess(res, {
    message: 'Settings updated.',
    data: {
      allowedMime: req.app.get('uploadAllowedMime'),
      retentionDays: req.app.get('uploadRetentionDays') ?? 90,
      queueStrategy: req.app.get('queueStrategy') || 'clinical-first',
    },
  });
});

const listNotificationTemplates = asyncHandler(async (req, res) => {
  const overrides = req.app.get('notificationTemplates') || {};
  const types = Object.keys(DEFAULT_TEMPLATES);
  return sendSuccess(res, {
    message: 'Notification templates. Variables allowed: {{visitId}} {{token}} {{status}} {{priority}}.',
    data: types.map((t) => ({ type: t, ...(overrides[t] || DEFAULT_TEMPLATES[t]), customized: Boolean(overrides[t]) })),
  });
});

const updateNotificationTemplate = asyncHandler(async (req, res) => {
  const { type } = req.params;
  if (!DEFAULT_TEMPLATES[type]) throw new HttpError(404, 'Unknown template type.');
  const subject = String(req.body.subject || '').slice(0, 160);
  const body = String(req.body.body || '').slice(0, 500);
  if (!subject || !body) throw new HttpError(422, 'Subject and body are required.');
  if (/\{\{\s*(?!visitId|token|status|priority)[a-zA-Z]+\s*\}\}/.test(`${subject} ${body}`)) {
    throw new HttpError(422, 'Only {{visitId}}, {{token}}, {{status}}, {{priority}} variables are allowed (no PHI).');
  }
  const overrides = { ...(req.app.get('notificationTemplates') || {}) };
  overrides[type] = { subject, body };
  req.app.set('notificationTemplates', overrides);
  return sendSuccess(res, { message: 'Template updated.', data: { type, subject, body } });
});

module.exports = { listRules, syncRules, updateRule, listAuditLogs, updateSettings, listNotificationTemplates, updateNotificationTemplate };
