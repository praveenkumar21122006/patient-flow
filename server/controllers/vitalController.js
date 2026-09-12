const VitalSigns = require('../models/VitalSigns');
const Intake = require('../models/Intake');
const PatientProfile = require('../models/PatientProfile');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { flagVitals } = require('../services/triageEngine');

const listVitals = asyncHandler(async (req, res) => {
  const { intake } = req.query;
  const filter = {};
  if (intake) filter.intake = intake;
  if (req.user.role === 'patient') {
    // Patients may only view their own vital-sign history.
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    if (!own) throw new HttpError(404, 'Patient profile not found.');
    if (intake) {
      const parent = await Intake.findById(intake).select('patient').lean();
      if (!parent || String(parent.patient) !== String(own._id)) throw new HttpError(403, 'You do not have permission to perform this action.');
    } else {
      filter.patient = own._id;
    }
  }
  const items = await VitalSigns.find(filter).populate('recordedBy', 'fullName role').sort('-recordedAt').lean();
  return sendSuccess(res, { message: 'Vital-sign history. Abnormal flags are informational only, not a diagnosis.', data: items });
});

const recordVitals = asyncHandler(async (req, res) => {
  const intake = await Intake.findById(req.body.intake);
  if (!intake) throw new HttpError(404, 'Intake not found.');
  // Previous readings are preserved: every recording is a new document.
  const payload = {
    intake: intake._id,
    patient: intake.patient,
    temperatureC: req.body.temperatureC ?? null,
    heartRateBpm: req.body.heartRateBpm ?? null,
    respiratoryRate: req.body.respiratoryRate ?? null,
    systolicBp: req.body.systolicBp ?? null,
    diastolicBp: req.body.diastolicBp ?? null,
    oxygenSaturation: req.body.oxygenSaturation ?? null,
    consciousness: req.body.consciousness || 'alert',
    bloodGlucoseMgDl: req.body.bloodGlucoseMgDl ?? null,
    weightKg: req.body.weightKg ?? null,
    heightCm: req.body.heightCm ?? null,
    mobility: req.body.mobility || 'independent',
    observations: req.body.observations || '',
    recordedBy: req.user.id,
    recordedAt: new Date(),
  };
  payload.abnormalFlags = flagVitals(payload);
  const doc = await VitalSigns.create(payload);
  if (['awaiting-triage'].includes(intake.status)) {
    intake.status = 'triage-in-progress';
    intake.statusTimeline.push({ status: 'triage-in-progress', at: new Date(), by: req.user.id, note: 'Vital signs recorded' });
    await intake.save();
  }
  return sendSuccess(res, { statusCode: 201, message: 'Vital signs recorded.', data: doc });
});

module.exports = { listVitals, recordVitals };
