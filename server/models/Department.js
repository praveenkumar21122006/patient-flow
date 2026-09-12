const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    averageConsultMinutes: { type: Number, default: 15, min: 1, max: 240 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Department', departmentSchema);
