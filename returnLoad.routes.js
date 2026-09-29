const express = require('express');
const router = express.Router();
const { listReturnLoads, smartReturnLoads } = require('./returnLoad.controller');
const { authenticateUser } = require('./auth');

router.get('/smart', authenticateUser, smartReturnLoads);
router.get('/', authenticateUser, listReturnLoads);

module.exports = router;
