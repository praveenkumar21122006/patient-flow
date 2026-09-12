const express = require('express');
const admin = require('../controllers/adminController');
const users = require('../controllers/userController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth, requireRoles('admin'));
router.get('/rules', admin.listRules);
router.post('/rules/sync', audit('admin.sync-rules'), admin.syncRules);
router.patch('/rules/:ruleId', audit('admin.update-rule'), admin.updateRule);
router.get('/audit-logs', admin.listAuditLogs);
router.patch('/settings', audit('admin.update-settings'), admin.updateSettings);
router.get('/notification-templates', admin.listNotificationTemplates);
router.patch('/notification-templates/:type', audit('admin.update-template'), admin.updateNotificationTemplate);
// Staff management aliases under /admin for convenience
router.get('/users', users.listUsers);
router.post('/users', audit('admin.create-staff'), users.createStaff);
router.patch('/users/:id/active', audit('admin.set-active'), users.setActive);
router.patch('/users/:id/role', audit('admin.set-role'), users.updateRole);
module.exports = router;
