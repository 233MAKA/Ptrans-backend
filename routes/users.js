const express = require('express');

const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/me', requireAuth, requirePermission('profile:read'), (req, res) => {
  return res.status(200).json({
    user: req.auth.user,
    sessionType: req.auth.type,
    permissions: req.auth.permissions || [],
  });
});

module.exports = router;
