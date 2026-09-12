const express = require('express');
const c = require('../controllers/clinicalReviewController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { validate } = require('../middleware/errors');
const { body } = require('express-validator');

const router = express.Router();
router.use(requireAuth, requireRoles('doctor', 'admin', 'nurse'));
router.get('/', c.listReviews);
router.post('/', [body('intake').isMongoId(), body('reviewNotes').trim().notEmpty().withMessage('Review notes are required.')], validate, c.addReview);
module.exports = router;
