const { body, param } = require('express-validator');

const pastDate = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error('Must be a valid date.');
  if (d > new Date()) throw new Error('Date cannot be in the future.');
  return true;
};

const patientDetails = [
  body('fullName').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 120 }),
  body('dateOfBirth').custom(pastDate),
  body('gender').isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Select a valid gender option.'),
  body('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']),
  body('phone').trim().notEmpty().withMessage('Phone number is required.').matches(/^[+()\-.\s\d]{6,25}$/).withMessage('Enter a valid phone number.'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address.'),
  body('emergencyContactName').trim().notEmpty().withMessage('Emergency contact name is required.'),
  body('emergencyContactPhone').trim().notEmpty().withMessage('Emergency contact phone is required.')
    .matches(/^[+()\-.\s\d]{6,25}$/).withMessage('Enter a valid emergency contact phone.'),
];

const visitInfo = [
  body('chiefComplaint').trim().notEmpty().withMessage('Chief complaint is required.').isLength({ max: 2000 }),
  body('arrivalMethod').optional().isIn(['walk-in', 'ambulance', 'wheelchair', 'stretcher', 'referred', 'other']),
  body('visitType').optional().isIn(['new', 'follow-up', 'emergency', 'referral']),
  body('symptomOnsetAt').optional({ checkFalsy: true }).isISO8601().withMessage('Symptom start must be a valid date/time.'),
];

const symptoms = [
  body('symptoms').isArray({ min: 1 }).withMessage('Select at least one symptom.'),
  body('painLevel').isFloat({ min: 0, max: 10 }).withMessage('Pain level must be between 0 and 10.'),
  body('severity').optional().isIn(['mild', 'moderate', 'severe']),
];

const background = [
  body('pregnancyStatus').optional().isIn(['not-applicable', 'not-pregnant', 'pregnant', 'possibly-pregnant', 'postpartum']),
];

// Progressive draft validation: every provided field is checked, but drafts may
// omit step-2+ fields until the wizard reaches them. Submit enforces completeness.
const draftIntake = [
  body('fullName').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Full name is too long.'),
  body('dateOfBirth').optional({ checkFalsy: true }).custom(pastDate),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Select a valid gender option.'),
  body('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']),
  body('phone').optional({ checkFalsy: true }).matches(/^[+()\-.\s\d]{6,25}$/).withMessage('Enter a valid phone number.'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address.'),
  body('emergencyContactPhone').optional({ checkFalsy: true }).matches(/^[+()\-.\s\d]{6,25}$/).withMessage('Enter a valid emergency contact phone.'),
  body('chiefComplaint').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Chief complaint is too long.'),
  body('arrivalMethod').optional().isIn(['walk-in', 'ambulance', 'wheelchair', 'stretcher', 'referred', 'other']),
  body('visitType').optional().isIn(['new', 'follow-up', 'emergency', 'referral']),
  body('symptomOnsetAt').optional({ checkFalsy: true }).isISO8601().withMessage('Symptom start must be a valid date/time.'),
  body('patient').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid patient reference.'),
];

const consentSubmit = [
  body('dataProcessing').equals('true').withMessage('Data-processing consent is required.'),
  body('accuracyConfirmed').equals('true').withMessage('Accuracy confirmation is required.'),
];

const idParam = [param('id').isMongoId().withMessage('Invalid identifier.')];

module.exports = { patientDetails, visitInfo, symptoms, background, consentSubmit, idParam, draftIntake };
