const express = require('express');
const c = require('../controllers/analyticsController');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRoles('nurse', 'doctor', 'admin', 'receptionist'));
router.get('/overview', c.overview);
module.exports = router;
