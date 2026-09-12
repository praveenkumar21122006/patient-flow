const mongoose = require('mongoose');

const CONSCIOUSNESS = ['alert', 'voice', 'pain', 'unresponsive'];

const vitalSignsSchema = new mongoose.Schema(
  {
    intake: { type: mongoose.Schema.Types.ObjectId, ref: 'Intake', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    temperatureC: { type: Number, min: 25, max: 45, default: null },
    heartRateBpm: { type: Number, min: 20, max: 250, default: null },
    respiratoryRate: { type: Number, min: 4, max: 80, default: null },
    systolicBp: { type: Number, min: 40, max: 300, default: null },
    diastolicBp: { type: Number, min: 20, max: 200, default: null },
    oxygenSaturation: { type: Number, min: 40, max: 100, default: null },
    consciousness: { type: String, enum: CONSCIOUSNESS, default: 'alert' },
    bloodGlucoseMgDl: { type: Number, min: 20, max: 1000, default: null },
    weightKg: { type: Number, min: 0.5, max: 400, default: null },
    heightCm: { type: Number, min: 20, max: 250, default: null },
    bmi: { type: Number, default: null },
    mobility: { type: String, enum: ['independent', 'assisted', 'wheelchair', 'stretcher', 'immobile'], default: 'independent' },
    observations: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, default: Date.now },
    // abnormal flags computed server-side (informational only, not a diagnosis)
    abnormalFlags: [{ type: String }],
  },
  { timestamps: true }
);

vitalSignsSchema.pre('save', function computeBmi(next) {
  if (this.weightKg && this.heightCm) {
    const m = this.heightCm / 100;
    this.bmi = Math.round((this.weightKg / (m * m)) * 10) / 10;
  }
  next();
});

module.exports = mongoose.model('VitalSigns', vitalSignsSchema);
module.exports.CONSCIOUSNESS = CONSCIOUSNESS;
