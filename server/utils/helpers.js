const crypto = require('crypto');

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function dailyCounter(prefix) {
  // Simple human-readable ids: e.g. PT-2026-004213. Uniqueness enforced by unique index + random suffix.
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
  const rand = crypto.randomInt(1000, 9999);
  return `${prefix}-${stamp}-${rand}`;
}

function patientId() {
  return dailyCounter('PT');
}

function visitId() {
  return dailyCounter('VS');
}

function queueToken(deptCode = 'GEN') {
  const rand = crypto.randomInt(100, 999);
  return `${String(deptCode).toUpperCase().slice(0, 4)}-${rand}`;
}

function apptId() {
  return dailyCounter('AP');
}

function yearsBetween(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function paginate(query, { page = 1, limit = 20 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  return { skip: (p - 1) * l, limit: l, page: p };
}

module.exports = { patientId, visitId, queueToken, apptId, yearsBetween, paginate };
