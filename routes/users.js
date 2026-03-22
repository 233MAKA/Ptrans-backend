const express = require('express');

const { requireAuth, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/authorization');
const { readUsers, replaceUsers } = require('../utils/userStore');

const router = express.Router();

router.get('/me', requireAuth, requirePermission(PERMISSIONS.PROFILE_READ), (req, res) => {
  return res.status(200).json({
    user: req.auth.user,
    sessionType: req.auth.type,
    permissions: req.auth.permissions || [],
  });
});

router.get('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), (_req, res) => {
  return res.status(200).json({ users: readUsers() });
});

router.put('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), (req, res) => {
  const nextUsers = req.body?.users;
  if (!Array.isArray(nextUsers)) {
    return res.status(400).json({ message: 'users must be an array' });
  }

  const savedUsers = replaceUsers(nextUsers);
  return res.status(200).json({ users: savedUsers });
});

module.exports = router;
