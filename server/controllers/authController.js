const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const User = require('../models/User');
const PatientProfile = require('../models/PatientProfile');
const StaffProfile = require('../models/StaffProfile');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendSuccess, sendError } = require('../utils/ApiResponse');
const { asyncHandler, HttpError } = require('../utils/asyncHandler');
const { patientId } = require('../utils/helpers');
const { writeAudit } = require('../middleware/audit');
const { sendMail } = require('../services/notificationService');

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function setAuthCookie(res, token) {
  res.cookie(config.jwtCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

const registerPatient = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone = '', dateOfBirth, gender = 'prefer-not-to-say' } = req.body;
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new HttpError(409, 'An account with this email already exists.');
  const user = new User({ email: email.toLowerCase(), role: 'patient', fullName, phone });
  await user.setPassword(password);
  await user.save();
  const profile = await PatientProfile.create({
    user: user._id,
    patientId: patientId(),
    fullName,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('1990-01-01'),
    gender,
    phone: phone || '',
    email: email.toLowerCase(),
  });
  await writeAudit({ actorId: user._id, actorRole: 'patient', action: 'auth.register', entityType: 'User', entityId: user._id, ip: req.ip });
  const token = signToken(user);
  setAuthCookie(res, token);
  return sendSuccess(res, { statusCode: 201, message: 'Registration successful.', data: { user: user.toSafeJSON(), patientId: profile.patientId, token } });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  // Generic message: never reveal whether the account exists.
  const generic = 'Invalid email or password.';
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash +isActive');
  if (!user) return sendError(res, { statusCode: 401, message: generic });
  if (user.isActive === false) return sendError(res, { statusCode: 401, message: generic });
  const ok = await user.verifyPassword(password);
  if (!ok) return sendError(res, { statusCode: 401, message: generic });
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  await writeAudit({ actorId: user._id, actorRole: user.role, action: 'auth.login', entityType: 'User', entityId: user._id, ip: req.ip });
  const token = signToken(user);
  setAuthCookie(res, token);
  return sendSuccess(res, { message: 'Login successful.', data: { user: user.toSafeJSON(), token } });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(config.jwtCookieName, { path: '/' });
  return sendSuccess(res, { message: 'Logged out successfully.', data: null });
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(401, 'Session is no longer valid. Please log in again.');
  let profile = null;
  if (user.role === 'patient') profile = await PatientProfile.findOne({ user: user._id }).lean();
  else profile = await StaffProfile.findOne({ user: user._id }).populate('department').lean();
  return sendSuccess(res, { message: 'Current user.', data: { user: user.toSafeJSON(), profile } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  // Always respond identically to avoid account enumeration.
  const { email } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+isActive');
  if (user && user.isActive !== false) {
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await PasswordResetToken.create({ user: user._id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    const resetLink = `${req.protocol}://${req.get('host')}/pages/forgot-password.html?token=${raw}`;
    // Dev fallback prints a redacted preview; production sends the link.
    await sendMail({ to: user.email, subject: 'PatientFlow password reset', text: `A password reset was requested. Use this link within 1 hour: ${resetLink}` });
    if (config.nodeEnv !== 'production') {
      return sendSuccess(res, { message: 'If an account exists, a reset link has been sent.', data: { devToken: raw } });
    }
  }
  return sendSuccess(res, { message: 'If an account exists, a reset link has been sent.', data: null });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const record = await PasswordResetToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!record) throw new HttpError(400, 'Reset link is invalid or has expired.');
  const user = await User.findById(record.user).select('+passwordHash');
  if (!user) throw new HttpError(400, 'Reset link is invalid or has expired.');
  await user.setPassword(password);
  await user.save();
  record.usedAt = new Date();
  await record.save();
  await writeAudit({ actorId: user._id, actorRole: user.role, action: 'auth.password-reset', entityType: 'User', entityId: user._id, ip: req.ip });
  return sendSuccess(res, { message: 'Password has been reset. Please log in.', data: null });
});

module.exports = { registerPatient, login, logout, me, forgotPassword, resetPassword, signToken, setAuthCookie };
