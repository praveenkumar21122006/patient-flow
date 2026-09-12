const express = require('express');
const c = require('../controllers/intakeController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { symptoms, background, draftIntake } = require('../validators/intakeValidators');
const { upload } = require('../middleware/upload');
const { audit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);
router.get('/', c.listIntakes);
router.post('/', draftIntake, validate, c.createIntake);
router.get('/:id', c.getIntake);
router.put('/:id', draftIntake, validate, c.updateDraft);
router.post('/:id/symptoms', symptoms, validate, c.saveSymptoms);
router.post('/:id/medical-history', background, validate, c.saveHistory);
router.post('/:id/submit', audit('intake.submit'), c.submitIntake);
router.post('/:id/documents', requireRoles('receptionist', 'nurse', 'doctor', 'admin', 'patient'), upload.array('documents', 3), c.addDocuments);
module.exports = router;
