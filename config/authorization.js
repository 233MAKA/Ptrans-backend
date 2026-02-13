const ROLE_PERMISSIONS = {
  guest: ['documents:read'],
  user: ['documents:read', 'documents:write', 'profile:read'],
  admin: ['*'],
};

function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  if (role === 'user') return 'user';
  return 'guest';
}

function getPermissionsForRole(role) {
  const safeRole = normalizeRole(role);
  return ROLE_PERMISSIONS[safeRole] || [];
}

module.exports = {
  ROLE_PERMISSIONS,
  normalizeRole,
  getPermissionsForRole,
};
