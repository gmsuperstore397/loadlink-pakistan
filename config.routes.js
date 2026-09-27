const express = require('express');
const router = express.Router();

router.get('/public', (req, res) => {
  res.json({
    success: true,
    data: {
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
      appName: 'LoadLink Pakistan',
    },
  });
});
module.exports = router;
