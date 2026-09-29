const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./auth');
const { createSOS, listMySOS, getTripSOS } = require('./sos.controller');

router.use(authenticateUser);
router.post('/trips/:tripId', createSOS);
router.get('/mine', listMySOS);
router.get('/trips/:tripId', getTripSOS);

module.exports = router;
