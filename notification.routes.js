const express = require('express');
const router = express.Router();
const { listNotifications, markAsRead } = require('../controllers/notification.controller');
const { authenticateUser } = require('../middleware/auth');

router.get('/', authenticateUser, listNotifications);
router.patch('/:id/read', authenticateUser, markAsRead);

module.exports = router;
