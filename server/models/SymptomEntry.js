const mongoose = require('mongoose');

const RED_FLAGS = [
  'chest-pain',
  'breathing-difficulty',
  'unresponsive',
  'severe-bleeding',
  'stroke-signs',
  'severe-allergic-reaction',
  'high-fever-with-rash',
  'suicidal-thoughts',
  'severe-abdominal-pain',
  'head-injury',
];

const symptomEntrySchema = new mongoose.Schema(
  {
    intake: { type: mongoose.Schema.Types.ObjectId, ref: 'Intake', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    symptoms: [{ type: String, trim: true }],
    duration: { type: String, default: '' },
    durationHours: { type: Number, default: null },
    severity: { type: String, enum: ['mild', 'moderate', 'severe'], default: 'moderate' },
    painLevel: { type: Number, min: 0, max: 10, default: 0 },
    painLocation: { type: String, default: '' },
    description: { type: String, default: '' },
    redFlags: [{ type: String, enum: RED_FLAGS }],
    isWorsening: { type: Boolean, default: false },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SymptomEntry', symptomEntrySchema);
module.exports.RED_FLAGS = RED_FLAGS;
