const crypto = require('crypto');
const prisma = require('./prisma');
const ApiError = require('./ApiError');

const DRIVER_REFERRAL_REWARD = 300;
const CUSTOMER_REFERRAL_REWARD = 250;
const LOAD_POINTS = 50;
const MILESTONES = { 5: 500, 10: 1250, 25: 3500, 50: 8000 };

function cleanCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

async function generateReferralCode(fullName = 'LL') {
  const base = String(fullName || 'LL').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'LL';
  for (let i = 0; i < 10; i += 1) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = (base + suffix).slice(0, 12);
    const exists = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return 'LL' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  const code = await generateReferralCode(user.fullName);
  await prisma.user.update({ where: { id: user.id }, data: { referralCode: code } });
  return code;
}

async function validateReferralCode(referralCode) {
  const code = cleanCode(referralCode);
  if (!code) return null;
  const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, status: true, referralCode: true } });
  if (!referrer || referrer.status !== 'ACTIVE') throw new ApiError(400, 'Invalid referral code');
  return referrer;
}

async function attachReferral(referredUserId, referralCode) {
  const code = cleanCode(referralCode);
  if (!code) return null;
  const referrer = await validateReferralCode(code);
  if (referrer.id === referredUserId) throw new ApiError(400, 'Self-referral is not allowed');

  const existing = await prisma.referral.findUnique({ where: { referredUserId } });
  if (existing) return existing;

  return prisma.referral.create({
    data: { referrerId: referrer.id, referredUserId, code },
  });
}

async function createReward(tx, { userId, amount = 0, points = 0, type, description, referenceKey, metadata = null }) {
  try {
    return await tx.rewardTransaction.create({
      data: { userId, amount, points, type, description, referenceKey, metadata: metadata ? JSON.stringify(metadata) : null },
    });
  } catch (error) {
    if (error?.code === 'P2002') return null;
    throw error;
  }
}

async function rewardReferral(referralId, amount, reason) {
  const referral = await prisma.referral.findUnique({ where: { id: referralId } });
  if (!referral || referral.status === 'REWARDED') return referral;
  return prisma.$transaction(async (tx) => {
    await createReward(tx, {
      userId: referral.referrerId,
      amount,
      type: 'REFERRAL_REWARD',
      description: reason,
      referenceKey: 'referral:' + referral.id,
      metadata: { referralId: referral.id, referredUserId: referral.referredUserId },
    });
    return tx.referral.update({
      where: { id: referral.id },
      data: { status: 'REWARDED', rewardAmount: amount, rewardReason: reason, qualifiedAt: new Date(), rewardedAt: new Date() },
    });
  });
}

async function rewardDriverReferralOnVerification(userId) {
  const referral = await prisma.referral.findFirst({ where: { referredUserId: userId, status: { in: ['PENDING', 'QUALIFIED'] } } });
  if (!referral) return null;
  const driver = await prisma.driverProfile.findUnique({ where: { userId }, select: { verification: true } });
  if (!driver || driver.verification !== 'VERIFIED') return null;
  return rewardReferral(referral.id, DRIVER_REFERRAL_REWARD, 'Driver referral reward — verified transporter');
}

async function rewardCustomerReferralOnDelivery(userId) {
  const referral = await prisma.referral.findFirst({ where: { referredUserId: userId, status: { in: ['PENDING', 'QUALIFIED'] } } });
  if (!referral) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== 'CUSTOMER') return null;
  return rewardReferral(referral.id, CUSTOMER_REFERRAL_REWARD, 'Customer referral reward — first completed load');
}

async function rewardDriverForCompletedLoad(driverUserId, tripId) {
  const driver = await prisma.driverProfile.findUnique({ where: { userId: driverUserId }, select: { id: true } });
  if (!driver) return null;
  const completedCount = await prisma.trip.count({ where: { driverId: driver.id, status: 'DELIVERED' } });
  const results = [];
  await prisma.$transaction(async (tx) => {
    const points = await createReward(tx, {
      userId: driverUserId,
      points: LOAD_POINTS,
      type: 'LOAD_COMPLETION_POINTS',
      description: 'Completed load reward',
      referenceKey: 'load-complete:' + tripId,
      metadata: { tripId, completedLoads: completedCount },
    });
    if (points) results.push(points);
    const milestoneAmount = MILESTONES[completedCount];
    if (milestoneAmount) {
      const milestone = await createReward(tx, {
        userId: driverUserId,
        amount: milestoneAmount,
        type: 'LOAD_MILESTONE_BONUS',
        description: 'LoadLink milestone bonus — ' + completedCount + ' completed loads',
        referenceKey: 'driver-milestone:' + driverUserId + ':' + completedCount,
        metadata: { completedLoads: completedCount },
      });
      if (milestone) results.push(milestone);
    }
  });
  return { completedCount, results };
}

async function getReferralDashboard(userId) {
  const [user, referrals, rewards, pointsAgg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, referralCode: true } }),
    prisma.referral.findMany({
      where: { referrerId: userId },
      include: { referredUser: { select: { id: true, fullName: true, role: true, status: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.rewardTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.rewardTransaction.aggregate({ where: { userId }, _sum: { amount: true, points: true } }),
  ]);
  const code = user?.referralCode || await ensureReferralCode(user);
  return {
    referralCode: code,
    referralLink: (process.env.PUBLIC_APP_URL || 'https://loadlink-pakistan.onrender.com') + '/?ref=' + encodeURIComponent(code),
    stats: {
      total: referrals.length,
      qualified: referrals.filter((r) => r.status === 'QUALIFIED' || r.status === 'REWARDED').length,
      rewarded: referrals.filter((r) => r.status === 'REWARDED').length,
      cashEarned: Number(rewards.reduce((sum, r) => sum + Number(r.amount || 0), 0).toFixed(2)),
      points: Number(pointsAgg._sum.points || 0),
    },
    referrals,
    rewards,
  };
}

module.exports = {
  DRIVER_REFERRAL_REWARD,
  CUSTOMER_REFERRAL_REWARD,
  LOAD_POINTS,
  MILESTONES,
  generateReferralCode,
  ensureReferralCode,
  attachReferral,
  rewardDriverReferralOnVerification,
  rewardCustomerReferralOnDelivery,
  rewardDriverForCompletedLoad,
  getReferralDashboard,
  validateReferralCode,
};
