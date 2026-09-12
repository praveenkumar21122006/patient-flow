const { body } = require('express-validator');

const futureDateTime = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error('Must be a valid date and time.');
  if (d <= new Date()) throw new Error('Appointment time must be in the future.');
  return true;
};

const createAppointment = [
  body('scheduledAt').isISO8601().withMessage('Scheduled time must be a valid date/time.').custom(futureDateTime),
  body('department').isMongoId().withMessage('Department is required.'),
  body('clinician').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid clinician reference.'),
  body('patient').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid patient reference.'),
  body('durationMinutes').optional().isInt({ min: 5, max: 480 }).withMessage('Duration must be 5–480 minutes.'),
  body('reason').trim().notEmpty().withMessage('Reason for visit is required.').isLength({ max: 500 }),
  body('notes').optional().isLength({ max: 2000 }),
];

const updateAppointment = [
  body('scheduledAt').optional().isISO8601().withMessage('Scheduled time must be a valid date/time.').custom(futureDateTime),
  body('department').optional().isMongoId().withMessage('Invalid department reference.'),
  body('clinician').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid clinician reference.'),
  body('durationMinutes').optional().isInt({ min: 5, max: 480 }).withMessage('Duration must be 5–480 minutes.'),
  body('status').optional().isIn(['scheduled', 'checked-in', 'in-consultation', 'completed', 'cancelled', 'no-show']).withMessage('Invalid status.'),
  body('cancelReason').optional().isLength({ max: 500 }),
  body('notes').optional().isLength({ max: 2000 }),
];

module.exports = { createAppointment, updateAppointment };
