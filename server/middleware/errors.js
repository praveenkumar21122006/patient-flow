const { validationResult } = require('express-validator');
const { sendError } = require('../utils/ApiResponse');

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path || e.param, message: e.msg }));
  return sendError(res, { statusCode: 422, message: 'Validation failed. Please check the highlighted fields.', errors });
}

function notFound(req, res) {
  return res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Central error handler. Never leak stack traces, credentials, or PHI to clients.
function errorHandler(err, req, res, _next) {
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  if (status >= 500) {
    // Log a sanitized summary server-side only.
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${status} ${err.message || 'internal error'}`);
  }
  const message =
    status >= 500 ? 'An unexpected error occurred. Please try again.' : err.message || 'Something went wrong';
  const body = { success: false, message };
  if (err.errors) body.errors = err.errors;
  return res.status(status).json(body);
}

module.exports = { validate, notFound, errorHandler };
