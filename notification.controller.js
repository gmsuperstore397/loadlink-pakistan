const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');

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

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
  return success(res, 200, 'All notifications marked as read', { count: result.count });
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
  return success(res, 200, 'Unread count', { count });
});

module.exports = { listNotifications, markAsRead, markAllAsRead, unreadCount };
