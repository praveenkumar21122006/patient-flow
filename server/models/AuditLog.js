const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, default: null },
    action: { type: String, required: true, index: true },
    entityType: { type: String, default: null, index: true },
    entityId: { type: String, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
  },
  { timestamps: true, capped: false }
);

auditLogSchema.index({ createdAt: -1 });

// Immutable by convention: no update/delete API is exposed; model helper blocks saves on existing docs.
auditLogSchema.pre('findOneAndUpdate', function block() {
  throw new Error('AuditLog entries are immutable and cannot be modified.');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
