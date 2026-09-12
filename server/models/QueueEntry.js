const mongoose = require('mongoose');

const queueEntrySchema = new mongoose.Schema(
  {
    intake: { type: mongoose.Schema.Types.ObjectId, ref: 'Intake', required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    suggestedPriority: { type: String, enum: ['critical', 'urgent', 'moderate', 'low', 'unclassified'], default: 'unclassified', index: true },
    confirmedPriority: { type: String, enum: ['critical', 'urgent', 'moderate', 'low', 'unclassified'], default: null, index: true },
    status: { type: String, default: 'awaiting-triage', index: true },
    arrivalAt: { type: Date, default: Date.now, index: true },
    estimatedWaitMinutes: { type: Number, default: null },
    assignedClinician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isEscalated: { type: Boolean, default: false, index: true },
    escalatedAt: { type: Date, default: null },
    position: { type: Number, default: null },
  },
  { timestamps: true }
);

queueEntrySchema.index({ confirmedPriority: 1, isEscalated: -1, arrivalAt: 1 });

module.exports = mongoose.model('QueueEntry', queueEntrySchema);
