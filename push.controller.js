const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');

const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(422).json({ success: false, message: 'Invalid push subscription' });
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  return success(res, 201, 'Push subscription saved', { subscription: { id: subscription.id } });
});
const unsubscribe = asyncHandler(async (req, res) => {
  if (req.body.endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint: req.body.endpoint, userId: req.user.id } });
  return success(res, 200, 'Push subscription removed');
});
module.exports = { subscribe, unsubscribe };
