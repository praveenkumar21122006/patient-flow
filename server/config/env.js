function getEnv(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

const config = {
  port: parseInt(getEnv('PORT', '5000'), 10),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  // Primary names per project spec (MONGODB_URI, CLIENT_URL); legacy MONGO_URI / CORS_ORIGIN kept as fallback.
  mongoUri: getEnv('MONGODB_URI', getEnv('MONGO_URI', 'mongodb://127.0.0.1:27017/patientflow')),
  jwtSecret: getEnv('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '8h'),
  jwtCookieName: getEnv('JWT_COOKIE_NAME', 'pf_token'),
  cookieSecure: getEnv('COOKIE_SECURE', 'false') === 'true',
  corsOrigin: getEnv('CLIENT_URL', getEnv('CORS_ORIGIN', 'http://localhost:5000')),
  uploadMaxMb: parseInt(getEnv('UPLOAD_MAX_MB', '5'), 10),
  uploadRetentionDays: parseInt(getEnv('UPLOAD_RETENTION_DAYS', '90'), 10),
  hospitalName: getEnv('HOSPITAL_NAME', 'City General Hospital'),
  smtp: {
    host: getEnv('SMTP_HOST', ''),
    port: parseInt(getEnv('SMTP_PORT', '587'), 10),
    user: getEnv('SMTP_USER', ''),
    pass: getEnv('SMTP_PASS', ''),
    from: getEnv('SMTP_FROM', 'PatientFlow <no-reply@patientflow.local>'),
  },
};

module.exports = config;
