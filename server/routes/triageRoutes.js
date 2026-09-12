const express = require('express');
const c = require('../controllers/triageController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { confirmTriage } = require('../validators/clinicalValidators');
const { body } = require('express-validator');

const router = express.Router();
router.use(requireAuth);
router.get('/', requireRoles('nurse', 'doctor', 'admin', 'patient'), c.listAssessments);
router.post('/assess', requireRoles('nurse', 'doctor', 'admin'), [body('intake').isMongoId().withMessage('Intake reference is required.')], validate, c.runAssessment);
router.post('/:id/confirm', requireRoles('nurse', 'doctor', 'admin'), confirmTriage, validate, c.confirmAssessment);
module.exports = router;
