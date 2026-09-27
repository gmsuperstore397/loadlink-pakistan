const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');

// GET /api/notifications
const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return success(res, 200, 'Notifications fetched', { notifications });
});

// PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification) throw new ApiError(404, 'Notification not found');
  if (notification.userId !== req.user.id) throw new ApiError(403, 'Not allowed');

  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
  return success(res, 200, 'Notification marked as read', { notification: updated });
});

module.exports = { listNotifications, markAsRead };
