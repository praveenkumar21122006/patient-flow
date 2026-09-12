const express = require('express');
const c = require('../controllers/departmentController');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.get('/', c.listDepartments);
router.post('/', requireRoles('admin'), c.createDepartment);
router.patch('/:id', requireRoles('admin'), c.updateDepartment);
module.exports = router;
