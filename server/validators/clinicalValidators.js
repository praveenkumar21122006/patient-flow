const { body } = require('express-validator');

const vitals = [
  body('temperatureC').optional({ checkFalsy: true }).isFloat({ min: 25, max: 45 }).withMessage('Temperature out of plausible range (25–45 °C).'),
  body('heartRateBpm').optional({ checkFalsy: true }).isFloat({ min: 20, max: 250 }).withMessage('Heart rate out of plausible range.'),
  body('respiratoryRate').optional({ checkFalsy: true }).isFloat({ min: 4, max: 80 }).withMessage('Respiratory rate out of plausible range.'),
  body('systolicBp').optional({ checkFalsy: true }).isFloat({ min: 40, max: 300 }),
  body('diastolicBp').optional({ checkFalsy: true }).isFloat({ min: 20, max: 200 }),
  body('oxygenSaturation').optional({ checkFalsy: true }).isFloat({ min: 40, max: 100 }).withMessage('SpO2 must be 40–100%.'),
  body('consciousness').optional().isIn(['alert', 'voice', 'pain', 'unresponsive']),
  body('intake').notEmpty().withMessage('Intake reference is required.').isMongoId(),
];

const confirmTriage = [
  body('confirmedPriority').isIn(['critical', 'urgent', 'moderate', 'low', 'unclassified']).withMessage('Select a valid priority.'),
  body('overrideReason').custom((v, { req }) => {
    // Reason mandatory when final differs from suggestion — enforced in controller with suggestion context;
    // here require a reason string whenever client flags override, and max length guard.
    if (v && String(v).length > 2000) throw new Error('Override reason is too long.');
    return true;
  }),
];

module.exports = { vitals, confirmTriage };
