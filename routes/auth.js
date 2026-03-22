const express = require('express');

const { githubConfig, hasGithubOAuthConfig } = require('../config/github');
const { getPermissionsForRole, getPermissionsFromFlags } = require('../config/authorization');
const { attachSession, requireAuth } = require('../middleware/auth');
const {
  exchangeCodeForAccessToken,
  getGithubAuthenticatedUser,
  revokeGithubOAuthGrant,
} = require('../utils/githubApi');
const { findPermissionFlagsByIdentity } = require('../utils/userStore');
const { createSession, revokeSession } = require('../utils/sessionStore');
const generateId = require('../utils/generateId');

const router = express.Router();

const oauthStateStore = new Map();
const oauthStateTtlMs = 10 * 60 * 1000;

function parseCsvSet(value = '') {
  return new Set(
    String(value)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function purgeExpiredOauthStates() {
  const now = Date.now();
  for (const [state, payload] of oauthStateStore.entries()) {
    if (payload.expiresAt <= now) {
      oauthStateStore.delete(state);
    }
  }
}

function createOauthState(frontendRedirectUrl) {
  purgeExpiredOauthStates();
  const state = generateId();

  oauthStateStore.set(state, {
    frontendRedirectUrl,
    expiresAt: Date.now() + oauthStateTtlMs,
  });

  return state;
}

function consumeOauthState(state) {
  purgeExpiredOauthStates();
  if (!state) return null;

  const payload = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  return payload || null;
}

function addQueryParams(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      target.searchParams.set(key, String(value));
    }
  }

  return target.toString();
}

router.get('/config', (_req, res) => {
  res.json({
    githubClientId: githubConfig.clientId || null,
    githubCallbackUrl: githubConfig.callbackUrl,
    frontendGithubSuccessUrl: process.env.FRONTEND_GITHUB_SUCCESS_URL || null,
    frontendGithubErrorUrl: process.env.FRONTEND_GITHUB_ERROR_URL || null,
  });
});

router.post('/guest', (req, res) => {
  const displayName = (req.body?.name || 'Guest').trim();
  const safeName = displayName.length > 50 ? displayName.slice(0, 50) : displayName;
  const role = 'guest';

  const session = createSession({
    type: 'guest',
    provider: 'guest',
    permissions: getPermissionsForRole(role),
    user: {
      id: `guest:${generateId()}`,
      name: safeName || 'Guest',
      role,
    },
  });

  return res.status(201).json({
    token: session.token,
    expiresAt: session.expiresAt,
    permissions: session.permissions,
    user: session.user,
  });
});

router.get('/github/start', (req, res) => {
  if (!githubConfig.clientId) {
    return res.status(500).json({ message: 'Missing GITHUB_CLIENT_ID configuration' });
  }

  const frontendRedirectUrl =
    req.query.frontendRedirectUrl || process.env.FRONTEND_GITHUB_SUCCESS_URL || null;
  const state = createOauthState(frontendRedirectUrl);

  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', githubConfig.clientId);
  githubUrl.searchParams.set('redirect_uri', githubConfig.callbackUrl);
  githubUrl.searchParams.set('scope', 'read:user user:email');
  githubUrl.searchParams.set('state', state);

  return res.redirect(githubUrl.toString());
});

router.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ message: 'Missing GitHub OAuth code' });
  }

  if (!hasGithubOAuthConfig) {
    return res.status(500).json({
      message: 'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET configuration',
    });
  }

  const oauthStatePayload = consumeOauthState(String(state || ''));
  if (!oauthStatePayload) {
    return res.status(400).json({ message: 'Invalid or expired OAuth state' });
  }

  try {
    const accessToken = await exchangeCodeForAccessToken({
      code,
      clientId: githubConfig.clientId,
      clientSecret: githubConfig.clientSecret,
      redirectUri: githubConfig.callbackUrl,
    });

    const githubUser = await getGithubAuthenticatedUser(accessToken);
    const login = String(githubUser.login || '').toLowerCase();

    const allowedUsers = parseCsvSet(process.env.GITHUB_ALLOWED_USERS || '');
    if (allowedUsers.size > 0 && !allowedUsers.has(login)) {
      return res.status(403).json({
        message: 'This GitHub account is not allowed to access this application',
      });
    }

    const adminUsers = parseCsvSet(process.env.GITHUB_ADMIN_USERS || '');
    const isAdmin = adminUsers.has(login);
    const role = isAdmin ? 'admin' : 'user';

    const matchedFlags = isAdmin
      ? { canEdit: true, canValidate: true, canPublish: true, matched: true }
      : findPermissionFlagsByIdentity({
          githubUsername: githubUser.login,
          email: githubUser.email,
        });

    const permissions = isAdmin
      ? getPermissionsForRole(role)
      : getPermissionsFromFlags({
          canEdit: matchedFlags.canEdit,
          canValidate: matchedFlags.canValidate,
          canPublish: matchedFlags.canPublish,
        });

    const session = createSession({
      type: 'user',
      provider: 'github',
      permissions,
      externalAccessToken: accessToken,
      user: {
        id: `github:${githubUser.id}`,
        name: githubUser.name || githubUser.login,
        username: githubUser.login,
        email: githubUser.email || null,
        avatarUrl: githubUser.avatar_url,
        profileUrl: githubUser.html_url,
        role,
        canEdit: Boolean(matchedFlags.canEdit),
        canValidate: Boolean(matchedFlags.canValidate),
        canPublish: Boolean(matchedFlags.canPublish),
      },
    });

    if (oauthStatePayload.frontendRedirectUrl) {
      const redirectUrl = addQueryParams(oauthStatePayload.frontendRedirectUrl, {
        token: session.token,
        provider: 'github',
        expiresAt: session.expiresAt,
      });

      return res.redirect(redirectUrl);
    }

    return res.status(200).json({
      token: session.token,
      expiresAt: session.expiresAt,
      permissions: session.permissions,
      user: session.user,
    });
  } catch (error) {
    const details = error.response?.data || error.message;
    const errorMessage = 'GitHub OAuth callback failed';

    const errorRedirectUrl = process.env.FRONTEND_GITHUB_ERROR_URL || null;
    if (errorRedirectUrl) {
      return res.redirect(
        addQueryParams(errorRedirectUrl, {
          error: errorMessage,
        }),
      );
    }

    return res.status(502).json({ message: errorMessage, details });
  }
});

router.get('/me', attachSession, (req, res) => {
  if (!req.auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  return res.json({
    user: req.auth.user,
    type: req.auth.type,
    provider: req.auth.provider,
    permissions: req.auth.permissions || [],
    expiresAt: req.auth.expiresAt,
  });
});

router.get('/permissions', requireAuth, (req, res) => {
  return res.json({ permissions: req.auth.permissions || [] });
});

router.post('/logout', requireAuth, async (req, res) => {
  if (
    req.auth?.provider === 'github' &&
    req.auth?.externalAccessToken &&
    hasGithubOAuthConfig
  ) {
    try {
      await revokeGithubOAuthGrant({
        accessToken: req.auth.externalAccessToken,
        clientId: githubConfig.clientId,
        clientSecret: githubConfig.clientSecret,
      });
    } catch (_error) {
      // Best effort: local logout must still succeed.
    }
  }

  revokeSession(req.auth.token);
  return res.status(204).send();
});

module.exports = router;
