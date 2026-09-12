const express = require('express');
const c = require('../controllers/userController');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

const router = express.Router();
router.get('/clinicians', requireAuth, requireRoles('receptionist', 'nurse', 'doctor', 'admin'), c.listClinicians);
router.use(requireAuth, requireRoles('admin'));
router.get('/', c.listUsers);
router.post('/', audit('admin.create-staff'), c.createStaff);
router.patch('/:id/active', audit('admin.set-active'), c.setActive);
router.patch('/:id/role', audit('admin.set-role'), c.updateRole);
module.exports = router;
