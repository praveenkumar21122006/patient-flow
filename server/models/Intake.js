const mongoose = require('mongoose');

const VISIT_STATUS = [
  'draft',
  'submitted',
  'awaiting-triage',
  'triage-in-progress',
  'awaiting-clinical-review',
  'escalated',
  'assigned',
  'in-consultation',
  'observation',
  'completed',
  'cancelled',
];

const intakeSchema = new mongoose.Schema(
  {
    visitId: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: VISIT_STATUS, default: 'draft', index: true },
    // Step 1 snapshot (demographics may change; keep what was submitted)
    demographics: {
      fullName: String,
      dateOfBirth: Date,
      gender: String,
      bloodGroup: String,
      phone: String,
      email: String,
      address: String,
      preferredLanguage: String,
      emergencyContactName: String,
      emergencyContactRelationship: String,
      emergencyContactPhone: String,
    },
    // Step 2
    arrivalMethod: { type: String, enum: ['walk-in', 'ambulance', 'wheelchair', 'stretcher', 'referred', 'other'], default: 'walk-in' },
    visitType: { type: String, enum: ['new', 'follow-up', 'emergency', 'referral'], default: 'new' },
    chiefComplaint: { type: String, required: true, trim: true },
    departmentPreference: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    assignedDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    symptomOnsetAt: { type: Date, default: null },
    previousVisitRef: { type: String, default: '' },
    // Relations
    symptoms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SymptomEntry' }],
    medicalHistory: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalHistory', default: null },
    consent: {
      dataProcessing: { type: Boolean, default: false },
      accuracyConfirmed: { type: Boolean, default: false },
      consentedAt: { type: Date, default: null },
    },
    documents: [{ filename: String, originalName: String, mime: String, size: Number, uploadedAt: Date }],
    assignedClinician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    statusTimeline: [
      {
        status: { type: String, enum: VISIT_STATUS },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: { type: String, default: '' },
      },
    ],
    isEmergencyGuest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

intakeSchema.index({ status: 1, createdAt: -1 });
intakeSchema.index({ assignedDepartment: 1, status: 1 });

module.exports = mongoose.model('Intake', intakeSchema);
module.exports.VISIT_STATUS = VISIT_STATUS;
