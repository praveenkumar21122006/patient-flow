const express = require('express');
const c = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.get('/', c.listNotifications);
router.post('/read-all', c.markAllRead);
router.post('/:id/read', c.markRead);
module.exports = router;
