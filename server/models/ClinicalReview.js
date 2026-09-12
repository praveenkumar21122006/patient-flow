const mongoose = require('mongoose');

const clinicalReviewSchema = new mongoose.Schema(
  {
    intake: { type: mongoose.Schema.Types.ObjectId, ref: 'Intake', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    summary: { type: String, default: '' },
    reviewNotes: { type: String, required: true },
    newStatus: { type: String, default: null },
    acknowledgedEmergency: { type: Boolean, default: false },
    reviewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClinicalReview', clinicalReviewSchema);
