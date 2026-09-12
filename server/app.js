const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const config = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
app.set('trust proxy', 1);
app.set('uploadAllowedMime', null); // admins may override at runtime via /admin/settings
app.set('uploadRetentionDays', 90);
app.set('queueStrategy', 'clinical-first');
app.set('notificationTemplates', {});

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
if (config.nodeEnv !== 'test') app.use(morgan('combined'));

// Global rate limit (conservative) + strict login limiter on /auth/login.
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });
app.use('/api/', globalLimiter);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});
app.use('/api/v1/auth/login', loginLimiter);

// API routes (versioned)
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/users', require('./routes/userRoutes'));
app.use('/api/v1/patients', require('./routes/patientRoutes'));
app.use('/api/v1/intakes', require('./routes/intakeRoutes'));
app.use('/api/v1/vitals', require('./routes/vitalRoutes'));
app.use('/api/v1/triage', require('./routes/triageRoutes'));
app.use('/api/v1/queue', require('./routes/queueRoutes'));
app.use('/api/v1/clinical-reviews', require('./routes/clinicalReviewRoutes'));
app.use('/api/v1/appointments', require('./routes/appointmentRoutes'));
app.use('/api/v1/departments', require('./routes/departmentRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));
app.use('/api/v1/reports', require('./routes/reportRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/audit-logs', require('./routes/auditLogRoutes'));

app.get('/api/v1/health', (req, res) => res.json({ success: true, message: 'PatientFlow API is running', data: { version: 'v1', env: config.nodeEnv } }));

// Serve the vanilla-JS frontend from /client in every env (single-process deployment).
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.path.includes('.')) return next();
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
