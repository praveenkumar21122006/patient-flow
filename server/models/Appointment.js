const mongoose = require('mongoose');

const APPT_STATUS = ['scheduled', 'checked-in', 'in-consultation', 'completed', 'cancelled', 'no-show'];
// Terminal states close the booking; only these free the slot for rebooking checks.
const ACTIVE_APPT_STATUS = ['scheduled', 'checked-in', 'in-consultation'];

const appointmentSchema = new mongoose.Schema(
  {
    appointmentId: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientProfile', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    clinician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 30, min: 5, max: 480 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: APPT_STATUS, default: 'scheduled', index: true },
    notes: { type: String, default: '', maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    checkedInAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
  },
  { timestamps: true }
);

appointmentSchema.index({ patient: 1, scheduledAt: 1 });
appointmentSchema.index({ department: 1, scheduledAt: 1 });
appointmentSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
module.exports.APPT_STATUS = APPT_STATUS;
module.exports.ACTIVE_APPT_STATUS = ACTIVE_APPT_STATUS;
