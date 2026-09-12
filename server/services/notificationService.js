const nodemailer = require('nodemailer');
const config = require('../config/env');

// Email abstraction. Never sends PHI: only token/visit identifiers and generic status text.
// Without SMTP configuration, logs a safe development preview.
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { host, port, user, pass } = config.smtp;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[notify:dev] to=<redacted> subject="${subject}" preview="${String(text).slice(0, 140)}"`);
    return { delivered: false, mode: 'dev-log' };
  }
  await t.sendMail({ from: config.smtp.from, to, subject, text });
  return { delivered: true, mode: 'smtp' };
}

function safeIntakeLine(intake) {
  if (!intake) return '';
  return `Visit: ${intake.visitId}. Please log in to PatientFlow to review. Do not reply to this message with medical details.`;
}

module.exports = { sendMail, safeIntakeLine, getTransporter };
