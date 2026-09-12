// Canonical in-app/email notification templates.
// Variables allowed: {{visitId}} {{token}} {{status}} {{priority}} — never PHI.
// Admins manage overrides at runtime via /admin/notification-templates;
// overrides are held in memory (app setting) for this release and documented
// as a future DB-backed collection.
const DEFAULT_TEMPLATES = {
  'intake-submitted': { subject: 'Intake received', body: 'Visit {{visitId}} was received and is awaiting triage. Check your dashboard for status.' },
  'triage-ready': { subject: 'Patient ready for triage', body: 'Visit {{visitId}} is awaiting triage.' },
  'critical-case': { subject: 'Critical case detected', body: 'Visit {{visitId}} received a critical suggestion. Clinical review required.' },
  'priority-override': { subject: 'Triage priority overridden', body: 'Visit {{visitId}} suggestion changed to {{priority}}. Reason recorded.' },
  'assignment': { subject: 'Patient assigned to you', body: 'Queue token {{token}} (visit {{visitId}}) is now assigned to you.' },
  'consultation-status': { subject: 'Your visit status changed', body: 'Visit {{visitId}} was reviewed. Current status: {{status}}. Check your dashboard.' },
  'queue-update': { subject: 'Update on your visit', body: 'Visit {{visitId}} has an update. Current status: {{status}}.' },
  'escalation': { subject: 'Emergency escalation', body: 'Queue token {{token}} was escalated and needs immediate review.' },
  'appointment-booked': { subject: 'Appointment booked', body: 'Visit {{visitId}} is booked. Current status: {{status}}.' },
  'appointment-cancelled': { subject: 'Appointment cancelled', body: 'Visit {{visitId}} was cancelled ({{status}}). Contact reception to rebook.' },
  'account-security': { subject: 'Security notice', body: 'A security event occurred on your account ({{status}}). Contact support if this was not you.' },
};

function renderTemplate(type, vars = {}, overrides = {}) {
  const tpl = overrides[type] || DEFAULT_TEMPLATES[type];
  if (!tpl) return { subject: type, body: '' };
  // Allow-list interpolation only; drop unknown placeholders instead of leaking data.
  const fill = (s) => String(s).replace(/\{\{\s*(visitId|token|status|priority)\s*\}\}/g, (_, k) => String(vars[k] ?? '—'));
  return { subject: fill(tpl.subject), body: fill(tpl.body) };
}

module.exports = { DEFAULT_TEMPLATES, renderTemplate };
