const { getSession } = require('../utils/sessionStore');

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

function attachSession(req, _res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    req.auth = null;
    return next();
  }

  const session = getSession(token);
  req.auth = session || null;
  return next();
}

function requireAuth(req, res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }

  const session = getSession(token);
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
