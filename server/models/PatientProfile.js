const mongoose = require('mongoose');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const GENDERS = ['male', 'female', 'other', 'prefer-not-to-say'];

const patientProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    patientId: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true, index: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: GENDERS, required: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, default: 'Unknown' },
    phone: { type: String, default: '', trim: true, index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    address: { type: String, default: '' },
    preferredLanguage: { type: String, default: 'English' },
    emergencyContactName: { type: String, default: '' },
    emergencyContactRelationship: { type: String, default: '' },
    emergencyContactPhone: { type: String, default: '' },
    privacyConsent: { type: Boolean, default: false },
    privacyPreferences: {
      shareForCare: { type: Boolean, default: true },
      allowSms: { type: Boolean, default: true },
      allowEmail: { type: Boolean, default: true },
    },
    isGuest: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

patientProfileSchema.index({ fullName: 'text', patientId: 'text', phone: 'text', email: 'text' });

module.exports = mongoose.model('PatientProfile', patientProfileSchema);
module.exports.BLOOD_GROUPS = BLOOD_GROUPS;
module.exports.GENDERS = GENDERS;
