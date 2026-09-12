const mongoose = require('mongoose');

// Stored rule configuration. The engine in services/triageEngine.js reads the ACTIVE
// rule set; thresholds never live in controllers or frontend files.
const triageRuleSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    version: { type: String, required: true, index: true },
    label: { type: String, required: true },
    category: { type: String, enum: ['red-flag', 'vitals', 'pain', 'demographic', 'history', 'arrival', 'fallback'], required: true },
    points: { type: Number, required: true, min: 0, max: 100 },
    condition: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true, index: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TriageRule', triageRuleSchema);
