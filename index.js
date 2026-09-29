const express = require('express');
const router = express.Router();

const { health } = require('./health.controller');

router.get('/health', health);
router.use('/config', require('./config.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/loads', require('./load.routes'));
router.use('/vehicles', require('./vehicle.routes'));
router.use('/transporters', require('./transporter.routes'));
router.use('/bookings', require('./booking.routes'));
router.use('/space', require('./space.routes'));
router.use('/trips', require('./trip.routes'));
router.use('/recommendations', require('./recommendation.routes'));
router.use('/fare', require('./fare.routes'));
router.use('/return-loads', require('./returnLoad.routes'));
router.use('/ratings', require('./rating.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/disputes', require('./dispute.routes'));
router.use('/sos', require('./sos.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/push', require('./push.routes'));
router.use('/location', require('./location.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
