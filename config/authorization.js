const PERMISSIONS = {
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_EDIT: 'documents:edit',
  DOCUMENTS_VALIDATE: 'documents:validate',
  DOCUMENTS_PUBLISH: 'documents:publish',
  PROFILE_READ: 'profile:read',
  USERS_MANAGE: 'users:manage',
};

const ROLE_PERMISSIONS = {
  guest: [PERMISSIONS.DOCUMENTS_READ],
  user: [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.PROFILE_READ],
  admin: ['*'],
};

function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  if (role === 'user') return 'user';
  return 'guest';
}

function normalizePermissions(permissions = []) {
  return Array.from(
    new Set(
      (Array.isArray(permissions) ? permissions : [])
        .map((permission) => String(permission || '').trim())
        .filter(Boolean),
    ),
  );
}

function getPermissionsForRole(role) {
  const safeRole = normalizeRole(role);
  return normalizePermissions(ROLE_PERMISSIONS[safeRole] || []);
}

function getPermissionsFromFlags({ canEdit, canValidate, canPublish } = {}) {
  const permissions = [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.PROFILE_READ];

  if (canEdit) permissions.push(PERMISSIONS.DOCUMENTS_EDIT);
  if (canValidate) permissions.push(PERMISSIONS.DOCUMENTS_VALIDATE);
  if (canPublish) permissions.push(PERMISSIONS.DOCUMENTS_PUBLISH);

  return normalizePermissions(permissions);
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  normalizeRole,
  normalizePermissions,
  getPermissionsForRole,
  getPermissionsFromFlags,
};
