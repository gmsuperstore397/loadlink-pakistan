const prisma = require('./prisma');
const { sendPush } = require('./push.service');

// In-app notification plus optional Web Push. Delivery failures never block the main request.
async function notify(userId, type, title, message) {
  try {
    const notification = await prisma.notification.create({ data: { userId, type, title, message } });
    await sendPush(userId, title, message, { type }).catch(() => {});
    return notification;
  } catch (e) {
    console.error('notify() failed:', e.message);
    return null;
  }
}

module.exports = notify;
