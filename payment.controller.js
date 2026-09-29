const crypto = require('crypto');
const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const ApiError = require('./ApiError');
const { success } = require('./apiResponse');
const notify = require('./notification.service');
const audit = require('./audit');

const createPayment = asyncHandler(async (req, res) => {
  const { tripId, amount, method } = req.body;
  const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
  if (idempotencyKey && idempotencyKey.length > 128) throw new ApiError(422, 'Invalid idempotency key');
  const validMethods = ['CASH', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'CARD'];
  if (!validMethods.includes(method)) throw new ApiError(422, 'Invalid payment method');
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100000000) throw new ApiError(422, 'Invalid payment amount');

  if (idempotencyKey) {
    const existing = await prisma.payment.findFirst({ where: { userId: req.user.id, metadata: JSON.stringify({ idempotencyKey }) } });
    if (existing) return success(res, 200, 'Payment already created', { payment: existing, idempotentReplay: true });
  }

  let trip = null;
  if (tripId) {
    trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } });
    if (!trip) throw new ApiError(404, 'Trip not found');
    const allowed = trip.load.customerId === req.user.id || (req.user.driverProfile && trip.driverId === req.user.driverProfile.id);
    if (!allowed && req.user.role !== 'ADMIN') throw new ApiError(403, 'Not allowed');
    if (trip.booking?.agreedFare != null && Math.abs(numericAmount - Number(trip.booking.agreedFare)) > 0.01) {
      throw new ApiError(422, 'Payment amount must match the agreed trip fare');
    }
  }

  const payment = await prisma.payment.create({
    data: { userId: req.user.id, tripId: trip?.id || null, amount: numericAmount, method, provider: method === 'EASYPAISA' || method === 'JAZZCASH' ? method : null, metadata: idempotencyKey ? JSON.stringify({ idempotencyKey }) : null },
  });

  const configuredUrl = method === 'EASYPAISA' ? process.env.EASYPAISA_CHECKOUT_URL : method === 'JAZZCASH' ? process.env.JAZZCASH_CHECKOUT_URL : null;
  if ((method === 'EASYPAISA' || method === 'JAZZCASH') && !configuredUrl) {
    return success(res, 201, 'Payment record created. Merchant checkout is not configured yet.', { payment, checkoutConfigured: false });
  }

  await audit(req, 'PAYMENT_CREATED', 'Payment', payment.id, { method, amount: numericAmount });
  return success(res, 201, 'Payment created', {
    payment,
    checkoutConfigured: !!configuredUrl,
    checkoutUrl: configuredUrl ? `${configuredUrl}${configuredUrl.includes('?') ? '&' : '?'}reference=${encodeURIComponent(payment.id)}&amount=${encodeURIComponent(numericAmount)}` : null,
  });
});

const listPayments = asyncHandler(async (req, res) => {
  const where = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
  const payments = await prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  return success(res, 200, 'Payments fetched', { payments });
});

const markPaid = asyncHandler(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new ApiError(403, 'Admin only');
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!payment) throw new ApiError(404, 'Payment not found');
  const updated = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: new Date(), providerReference: req.body.providerReference || null } });
  await notify(updated.userId, 'PAYMENT_PAID', 'Payment confirmed', `Your payment of PKR ${updated.amount.toLocaleString()} has been confirmed.`);
  await audit(req, 'PAYMENT_MARKED_PAID', 'Payment', payment.id, { providerReference: req.body.providerReference });
  return success(res, 200, 'Payment marked as paid', { payment: updated });
});

const paymentWebhook = asyncHandler(async (req, res) => {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const signature = String(req.headers['x-payment-signature'] || '');
  const legacySecret = String(req.headers['x-payment-webhook-secret'] || '');
  if (!secret) throw new ApiError(503, 'Payment webhook is not configured');

  const payload = JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const signatureOk = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  const legacyOk = !signature && legacySecret === secret;
  if (!signatureOk && !legacyOk) throw new ApiError(401, 'Invalid webhook signature');

  const { paymentId, status, providerReference } = req.body;
  if (!paymentId || !['PAID', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status)) throw new ApiError(422, 'Invalid webhook payload');

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new ApiError(404, 'Payment not found');

  // Idempotent webhook handling: replaying the same final state is harmless.
  if (payment.status === status && (!providerReference || payment.providerReference === providerReference)) {
    return success(res, 200, 'Webhook already processed', { alreadyProcessed: true });
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status, providerReference: providerReference || payment.providerReference, paidAt: status === 'PAID' ? (payment.paidAt || new Date()) : null }
  });
  await notify(updated.userId, status === 'PAID' ? 'PAYMENT_PAID' : 'PAYMENT_FAILED', 'Payment update', `Payment status: ${status}.`);
  return success(res, 200, 'Webhook processed');
});

module.exports = { createPayment, listPayments, markPaid, paymentWebhook };
