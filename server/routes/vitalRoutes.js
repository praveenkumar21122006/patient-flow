const express = require('express');
const c = require('../controllers/vitalController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { vitals } = require('../validators/clinicalValidators');
const { audit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);
router.get('/', requireRoles('nurse', 'doctor', 'admin', 'patient'), c.listVitals);
router.post('/', requireRoles('nurse', 'doctor', 'admin'), vitals, validate, audit('vitals.record'), c.recordVitals);
module.exports = router;
