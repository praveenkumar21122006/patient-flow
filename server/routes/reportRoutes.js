const express = require('express');
const c = require('../controllers/reportController');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.get('/intake/:id/pdf', c.intakePdf);
router.get('/intake/:id', c.intakeSummary);
router.get('/daily', requireRoles('receptionist', 'nurse', 'doctor', 'admin'), c.dailyReport);
router.get('/priority-distribution', requireRoles('nurse', 'doctor', 'admin'), c.priorityDistribution);
router.get('/department-workload', requireRoles('nurse', 'doctor', 'admin'), c.departmentWorkload);
router.get('/waiting-times', requireRoles('nurse', 'doctor', 'admin'), c.waitingTimeReport);
router.get('/audit', requireRoles('admin'), c.auditReport);
router.get('/export-audit', requireRoles('admin'), c.exportAuditCsv);
router.get('/export/:type', requireRoles('nurse', 'doctor', 'admin', 'receptionist'), c.exportCsv);
module.exports = router;
