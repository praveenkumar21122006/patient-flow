const User = require('../models/User');
const PatientProfile = require('../models/PatientProfile');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { paginate, patientId } = require('../utils/helpers');

function canSeeClinical(role) {
  return ['nurse', 'doctor', 'admin'].includes(role);
}

// Receptionists + staff can search; patients only see their own record.
const searchPatients = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const { skip, limit: lim, page: p } = paginate(req.query, { page, limit });
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    return sendSuccess(res, { message: 'Patient profile.', data: own ? [own] : [], meta: { page: p, limit: lim, total: own ? 1 : 0, pages: 1 } });
  }
  const filter = {};
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ fullName: rx }, { patientId: rx }, { phone: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    PatientProfile.find(filter).sort('-createdAt').skip(skip).limit(lim).lean(),
    PatientProfile.countDocuments(filter),
  ]);
  return sendSuccess(res, { message: 'Patients.', data: items, meta: { page: p, limit: lim, total, pages: Math.ceil(total / lim) } });
});

const registerPatientByStaff = asyncHandler(async (req, res) => {
  const b = req.body;
  const email = b.email ? String(b.email).toLowerCase() : `guest-${Date.now()}@patientflow.local`;
  let user = b.email ? await User.findOne({ email }) : null;
  if (user) throw new HttpError(409, 'A user with this email already exists. Attach the intake to the existing patient instead.');
  user = new User({ email, role: 'patient', fullName: b.fullName, phone: b.phone || '' });
  await user.setPassword(`Temp-${Math.random().toString(36).slice(2, 10)}!1`);
  user.mustChangePassword = true;
  await user.save();
  const profile = await PatientProfile.create({
    user: user._id,
    patientId: patientId(),
    fullName: b.fullName,
    dateOfBirth: new Date(b.dateOfBirth),
    gender: b.gender,
    bloodGroup: b.bloodGroup || 'Unknown',
    phone: b.phone,
    email: b.email || email,
    address: b.address || '',
    preferredLanguage: b.preferredLanguage || 'English',
    emergencyContactName: b.emergencyContactName || '',
    emergencyContactRelationship: b.emergencyContactRelationship || '',
    emergencyContactPhone: b.emergencyContactPhone || '',
    isGuest: Boolean(b.isGuest),
  });
  return sendSuccess(res, { statusCode: 201, message: 'Patient registered.', data: profile });
});

const getPatient = asyncHandler(async (req, res) => {
  const profile = await PatientProfile.findById(req.params.id).lean();
  if (!profile) throw new HttpError(404, 'Patient not found.');
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id }).lean();
    if (!own || String(own._id) !== String(profile._id)) throw new HttpError(403, 'You do not have permission to perform this action.');
  }
  return sendSuccess(res, { message: 'Patient profile.', data: profile });
});

const updatePatient = asyncHandler(async (req, res) => {
  const allowed = ['fullName', 'phone', 'email', 'address', 'preferredLanguage', 'bloodGroup', 'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone', 'privacyPreferences'];
  if (req.user.role === 'patient') {
    const own = await PatientProfile.findOne({ user: req.user.id });
    if (!own || String(own._id) !== req.params.id) throw new HttpError(403, 'You do not have permission to perform this action.');
  }
  const profile = await PatientProfile.findById(req.params.id);
  if (!profile) throw new HttpError(404, 'Patient not found.');
  allowed.forEach((k) => { if (req.body[k] !== undefined) profile[k] = req.body[k]; });
  await profile.save();
  return sendSuccess(res, { message: 'Patient details updated.', data: profile });
});

module.exports = { searchPatients, registerPatientByStaff, getPatient, updatePatient, canSeeClinical };
