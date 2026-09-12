const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { sendError } = require('../utils/ApiResponse');
const User = require('../models/User');

function getTokenFromRequest(req) {
  if (req.cookies && req.cookies[config.jwtCookieName]) return req.cookies[config.jwtCookieName];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

async function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return sendError(res, { statusCode: 401, message: 'Authentication required. Please log in.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).select('+isActive');
    if (!user || user.isActive === false) {
      return sendError(res, { statusCode: 401, message: 'Session is no longer valid. Please log in again.' });
    }
    req.user = { id: String(user._id), role: user.role, email: user.email };
    req.authUser = user;
    return next();
  } catch (err) {
    return sendError(res, { statusCode: 401, message: 'Session expired. Please log in again.' });
  }
}

function requireRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user) return sendError(res, { statusCode: 401, message: 'Authentication required. Please log in.' });
    if (!allowed.includes(req.user.role)) {
      return sendError(res, { statusCode: 403, message: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRoles, getTokenFromRequest };
