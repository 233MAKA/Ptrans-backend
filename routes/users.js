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

function getGithubUserToken(req) {
  return req.auth?.provider === 'github' ? req.auth.externalAccessToken : null;
}

router.get('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    return res.status(200).json({ users: await readUsers({ token: getGithubUserToken(req) }) });
  } catch (err) {
    return res.status(err.response?.status || 500).json({
      message: err.response?.data?.message || err.message || 'Failed to load users',
    });
  }
});

router.put('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  const nextUsers = req.body?.users;
  if (!Array.isArray(nextUsers)) {
    return res.status(400).json({ message: 'users must be an array' });
  }

  try {
    const savedUsers = await replaceUsers(nextUsers, {
      token: getGithubUserToken(req),
      actor: {
        githubId: req.auth?.user?.githubId,
        githubUsername: req.auth?.user?.username,
        name: req.auth?.user?.name,
      },
    });
    return res.status(200).json({ users: savedUsers });
  } catch (err) {
    return res.status(err.response?.status || 500).json({
      message: err.response?.data?.message || err.message || 'Failed to save users',
    });
  }
});

module.exports = router;
