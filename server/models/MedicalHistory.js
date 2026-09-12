const mongoose = require('mongoose');

const medicalHistorySchema = new mongoose.Schema(
  {
    intake: { type: mongoose.Schema.Types.ObjectId, ref: 'Intake', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    conditions: [{ type: String, trim: true }],
    previousSurgeries: [{ type: String, trim: true }],
    pregnancyStatus: { type: String, enum: ['not-applicable', 'not-pregnant', 'pregnant', 'possibly-pregnant', 'postpartum'], default: 'not-applicable' },
    allergies: [{ name: String, reaction: String }],
    medications: [{ name: String, dosage: String, frequency: String }],
    recentHospitalization: { type: String, default: '' },
    familyHistory: { type: String, default: '' },
    communicableScreening: {
      fever: { type: Boolean, default: false },
      cough: { type: Boolean, default: false },
      contactWithInfectious: { type: Boolean, default: false },
      recentTravel: { type: Boolean, default: false },
      notes: { type: String, default: '' },
    },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MedicalHistory', medicalHistorySchema);
