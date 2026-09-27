const express = require('express');
const router = express.Router();
const { listNotifications, markAsRead, markAllAsRead, unreadCount } = require('./notification.controller');
const { authenticateUser } = require('./auth');

router.get('/', authenticateUser, listNotifications);
router.get('/unread-count', authenticateUser, unreadCount);
router.patch('/read-all', authenticateUser, markAllAsRead);
router.patch('/:id/read', authenticateUser, markAsRead);

module.exports = router;
