const Notification = require('../models/Notification');
const User = require('../models/User');
const { renderTemplate } = require('./notificationTemplates');

async function notifyUser(recipientId, { type, title, body = '', relatedIntake = null }) {
  if (!recipientId) return null;
  return Notification.create({ recipient: recipientId, type, title, body, relatedIntake });
}

// Template-rendered notification: titles/bodies come from the admin-managed
// catalogue (overrides optional), keeping copy consistent and PHI-free.
async function notifyFromTemplate(recipientId, type, vars = {}, { relatedIntake = null, overrides = {} } = {}) {
  if (!recipientId) return null;
  const { subject, body } = renderTemplate(type, vars, overrides);
  return Notification.create({ recipient: recipientId, type, title: subject, body, relatedIntake });
}

function templateOverrides(app) {
  return (app && app.get('notificationTemplates')) || {};
}

// Broadcast to all active users of given roles (e.g. emergency alerts to doctors/nurses).
async function notifyRoles(roles, payload) {
  const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id').lean();
  if (!users.length) return [];
  const docs = users.map((u) => ({ recipient: u._id, ...payload }));
  return Notification.insertMany(docs);
}

module.exports = { notifyUser, notifyRoles, notifyFromTemplate, templateOverrides };
