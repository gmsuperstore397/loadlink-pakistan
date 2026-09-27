const prisma = require('./prisma');
const { sendPush } = require('./push.service');
const { sendSms, sendWhatsApp } = require('./delivery.service');

// In-app notification plus optional Web Push/SMS/WhatsApp. Delivery failures never block the main request.
async function notify(userId, type, title, message) {
  try {
    const notification = await prisma.notification.create({ data: { userId, type, title, message } });
    await sendPush(userId, title, message, { type }).catch(() => {});
    if (process.env.NOTIFY_SMS === 'true' || process.env.NOTIFY_WHATSAPP === 'true') {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { mobile: true } });
      if (user?.mobile && process.env.NOTIFY_SMS === 'true') await sendSms(user.mobile, `${title}: ${message}`).catch(() => {});
      if (user?.mobile && process.env.NOTIFY_WHATSAPP === 'true') await sendWhatsApp(user.mobile, `${title}: ${message}`).catch(() => {});
    }
    return notification;
  } catch (e) {
    console.error('notify() failed:', e.message);
    return null;
  }
}

module.exports = notify;
