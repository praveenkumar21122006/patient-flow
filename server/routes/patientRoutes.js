const express = require('express');
const c = require('../controllers/patientController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { patientDetails } = require('../validators/intakeValidators');
const { audit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);
router.get('/', c.searchPatients);
router.post('/', requireRoles('receptionist', 'admin', 'nurse'), patientDetails, validate, audit('patient.register'), c.registerPatientByStaff);
router.get('/:id', c.getPatient);
router.patch('/:id', requireRoles('receptionist', 'admin', 'nurse', 'patient'), audit('patient.update'), c.updatePatient);
module.exports = router;
