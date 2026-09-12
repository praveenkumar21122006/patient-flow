const { body } = require('express-validator');

const passwordRule = body('password')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
  .matches(/[A-Za-z]/).withMessage('Password must include a letter.')
  .matches(/[0-9]/).withMessage('Password must include a number.');

const registerPatient = [
  body('fullName').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 120 }),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  passwordRule,
  body('phone').optional().trim().isLength({ max: 30 }),
  body('dateOfBirth').optional().isISO8601().withMessage('Date of birth must be a valid date.'),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer-not-to-say']),
];

const login = [
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

const forgotPassword = [body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail()];
const resetPassword = [
  body('token').notEmpty().withMessage('Reset token is required.'),
  passwordRule,
];

module.exports = { registerPatient, login, forgotPassword, resetPassword };
