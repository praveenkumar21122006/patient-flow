const express = require('express');
const c = require('../controllers/appointmentController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { createAppointment, updateAppointment } = require('../validators/appointmentValidators');
const { audit } = require('../middleware/audit');

const router = express.Router();
router.use(requireAuth);
router.get('/', c.listAppointments);
router.post('/', createAppointment, validate, audit('appointment.create'), c.createAppointment);
router.patch('/:id', updateAppointment, validate, audit('appointment.update'), c.updateAppointment);
module.exports = router;
