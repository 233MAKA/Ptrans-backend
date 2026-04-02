const { getSession, updateSession } = require('../utils/sessionStore');
const { getPermissionsForRole, getPermissionsFromFlags } = require('../config/authorization');
const { findPermissionFlagsByIdentity } = require('../utils/userStore');

function parseBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

function hasPermission(auth, permission) {
  if (!auth || !permission) return false;

  const grantedPermissions = Array.isArray(auth.permissions) ? auth.permissions : [];
  return grantedPermissions.includes('*') || grantedPermissions.includes(permission);
}

function parseCsvSet(value = '') {
  return new Set(
    String(value)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function refreshGithubSession(session) {
  if (!session || session.provider !== 'github' || session.type !== 'user') return session;

  const login = String(session.user?.username || '').trim().toLowerCase();
  const email = String(session.user?.email || '').trim().toLowerCase();
  const adminUsers = parseCsvSet(process.env.GITHUB_ADMIN_USERS || '');
  const isAdmin = Boolean(login) && adminUsers.has(login);
  const role = isAdmin ? 'admin' : 'user';

  const matchedFlags = isAdmin
    ? { canEdit: true, canValidate: true, canPublish: true }
    : findPermissionFlagsByIdentity({
        githubUsername: login,
        email,
      });

  const permissions = isAdmin
    ? getPermissionsForRole(role)
    : getPermissionsFromFlags({
        canEdit: matchedFlags.canEdit,
        canValidate: matchedFlags.canValidate,
        canPublish: matchedFlags.canPublish,
      });

  const nextUser = {
    ...session.user,
    role,
    canEdit: Boolean(matchedFlags.canEdit),
    canValidate: Boolean(matchedFlags.canValidate),
    canPublish: Boolean(matchedFlags.canPublish),
  };

  const currentPermissions = Array.isArray(session.permissions) ? session.permissions : [];
  const permissionsChanged =
    JSON.stringify(currentPermissions) !== JSON.stringify(permissions);
  const userChanged =
    session.user?.role !== nextUser.role ||
    Boolean(session.user?.canEdit) !== nextUser.canEdit ||
    Boolean(session.user?.canValidate) !== nextUser.canValidate ||
    Boolean(session.user?.canPublish) !== nextUser.canPublish;

  if (!permissionsChanged && !userChanged) return session;

  return updateSession(session.token, {
    permissions,
    user: nextUser,
  });
}

function attachSession(req, _res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    req.auth = null;
    return next();
  }

  const session = refreshGithubSession(getSession(token));
  req.auth = session || null;
  return next();
}

function requireAuth(req, res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }

  const session = refreshGithubSession(getSession(token));
  if (!session) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  req.auth = session;
  return next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!hasPermission(req.auth, permission)) {
      return res.status(403).json({
        message: 'Forbidden: missing permission',
        required: permission,
      });
    }

    return next();
  };
}

module.exports = {
  attachSession,
  hasPermission,
  requireAuth,
  requirePermission,
};
