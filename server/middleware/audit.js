const AuditLog = require('../models/AuditLog');

// Fire-and-forget audit writer: never blocks the clinical workflow on logging failure.
async function writeAudit({ actorId = null, actorRole = null, action, entityType = null, entityId = null, metadata = {}, ip = null }) {
  try {
    await AuditLog.create({ actor: actorId, actorRole, action, entityType, entityId: entityId ? String(entityId) : null, metadata, ip });
  } catch (err) {
    console.error(`[audit] failed to persist event ${action}: ${err.message}`);
  }
}

function audit(action, opts = {}) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        writeAudit({
          actorId: req.user ? req.user.id : null,
          actorRole: req.user ? req.user.role : null,
          action,
          entityType: opts.entityType || null,
          entityId: (req.params && (req.params.id || req.params.intakeId)) || null,
          metadata: opts.metadata ? opts.metadata(req) : {},
          ip: req.ip,
        });
      }
    });
    next();
  };
}

module.exports = { writeAudit, audit };
