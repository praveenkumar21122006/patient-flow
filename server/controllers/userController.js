const User = require('../models/User');
const StaffProfile = require('../models/StaffProfile');
const { sendSuccess } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { paginate } = require('../utils/helpers');

const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, search = '', sort = '-createdAt' } = req.query;
  const { skip, limit: lim, page: p } = paginate(req.query, { page, limit });
  const filter = {};
  if (role) filter.role = role;
  if (search) filter.$or = [{ fullName: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(lim).lean(),
    User.countDocuments(filter),
  ]);
  const data = items.map((u) => ({ id: String(u._id), email: u.email, role: u.role, fullName: u.fullName, phone: u.phone, isActive: u.isActive, createdAt: u.createdAt }));
  return sendSuccess(res, { message: 'Staff and user accounts.', data, meta: { page: p, limit: lim, total, pages: Math.ceil(total / lim) } });
});

const createStaff = asyncHandler(async (req, res) => {
  const { fullName, email, password, role, phone = '', department = null, title = '' } = req.body;
  if (!['receptionist', 'nurse', 'doctor', 'admin'].includes(role)) throw new HttpError(422, 'Role must be receptionist, nurse, doctor, or admin.');
  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw new HttpError(409, 'An account with this email already exists.');
  const user = new User({ fullName, email: String(email).toLowerCase(), role, phone });
  await user.setPassword(password);
  await user.save();
  await StaffProfile.create({ user: user._id, staffId: `ST-${Date.now().toString(36).toUpperCase()}`, department: department || null, title });
  return sendSuccess(res, { statusCode: 201, message: 'Staff account created.', data: user.toSafeJSON() });
});

const setActive = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found.');
  if (String(user._id) === req.user.id) throw new HttpError(400, 'You cannot deactivate your own account.');
  user.isActive = Boolean(req.body.isActive);
  await user.save();
  return sendSuccess(res, { message: user.isActive ? 'Account activated.' : 'Account deactivated.', data: user.toSafeJSON() });
});

const updateRole = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found.');
  if (!['receptionist', 'nurse', 'doctor', 'admin', 'patient'].includes(req.body.role)) throw new HttpError(422, 'Invalid role.');
  user.role = req.body.role;
  await user.save();
  return sendSuccess(res, { message: 'Role updated.', data: user.toSafeJSON() });
});

// Staff-facing clinician picker for assignment (no emails beyond name/role/dept).
const listClinicians = asyncHandler(async (req, res) => {
  const items = await User.find({ role: { $in: ['doctor', 'nurse'] }, isActive: true })
    .sort('fullName').limit(100).select('fullName role').lean();
  return sendSuccess(res, { message: 'Available clinicians.', data: items.map((u) => ({ id: String(u._id), fullName: u.fullName, role: u.role })) });
});

module.exports = { listUsers, createStaff, setActive, updateRole, listClinicians };
