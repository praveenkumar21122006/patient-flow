const express = require('express');
const c = require('../controllers/authController');
const { validate } = require('../middleware/errors');
const { registerPatient, login, forgotPassword, resetPassword } = require('../validators/authValidators');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.post('/register', registerPatient, validate, c.registerPatient);
router.post('/login', login, validate, c.login);
router.post('/logout', c.logout);
router.get('/me', requireAuth, c.me);
router.post('/forgot-password', forgotPassword, validate, c.forgotPassword);
router.post('/reset-password', resetPassword, validate, c.resetPassword);
module.exports = router;
