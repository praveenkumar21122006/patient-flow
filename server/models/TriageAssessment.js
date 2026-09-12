const mongoose = require('mongoose');

const PRIORITIES = ['critical', 'urgent', 'moderate', 'low', 'unclassified'];

const triageAssessmentSchema = new mongoose.Schema(
  {
    intake: { type: mongoose.Schema.Types.ObjectId, ref: 'Intake', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    ruleVersion: { type: String, required: true, index: true },
    suggestedPriority: { type: String, enum: PRIORITIES, required: true, index: true },
    matchedRules: [{ ruleId: String, label: String, points: Number, detail: String }],
    riskIndicators: [{ type: String }],
    explanation: { type: String, default: '' },
    score: { type: Number, default: 0 },
    // Clinician confirmation (mandatory workflow step)
    confirmedPriority: { type: String, enum: PRIORITIES, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
    overrideReason: { type: String, default: '' },
    triageNotes: { type: String, default: '' },
    assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assessedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['suggested', 'confirmed', 'overridden'], default: 'suggested', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TriageAssessment', triageAssessmentSchema);
module.exports.PRIORITIES = PRIORITIES;
