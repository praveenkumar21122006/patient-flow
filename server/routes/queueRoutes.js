const express = require('express');
const c = require('../controllers/queueController');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.get('/stream', c.streamQueue);
router.get('/', c.listQueue);
router.post('/:intakeId/escalate', requireRoles('nurse', 'doctor', 'admin'), c.escalate);
router.post('/:intakeId/assign', requireRoles('nurse', 'doctor', 'admin', 'receptionist'), c.assignClinician);
module.exports = router;
