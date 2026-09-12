function sendSuccess(res, { message = 'OK', data = null, meta = undefined, statusCode = 200 } = {}) {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
}

function sendError(res, { message = 'Something went wrong', statusCode = 500, errors = undefined } = {}) {
  const body = { success: false, message };
  if (errors !== undefined) body.errors = errors;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess, sendError };
