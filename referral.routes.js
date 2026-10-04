const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./auth');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const { ensureReferralCode, attachReferral, getReferralDashboard } = require('./referral.service');

router.get('/me', authenticateUser, asyncHandler(async (req, res) => {
  await ensureReferralCode(req.user);
  const dashboard = await getReferralDashboard(req.user.id);
  return success(res, 200, 'Referral dashboard fetched', dashboard);
}));

router.post('/attach', authenticateUser, asyncHandler(async (req, res) => {
  const referral = await attachReferral(req.user.id, req.body?.referralCode);
  return success(res, 200, referral ? 'Referral attached' : 'No referral code supplied', { referral });
}));

module.exports = router;
