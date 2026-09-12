const express = require('express');
const admin = require('../controllers/adminController');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRoles('admin'));
router.get('/', admin.listAuditLogs);
module.exports = router;
