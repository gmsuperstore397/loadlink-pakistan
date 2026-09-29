const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./auth');
const { getPrivateDocument } = require('./document.controller');

router.get('/:filename', authenticateUser, getPrivateDocument);

module.exports = router;
