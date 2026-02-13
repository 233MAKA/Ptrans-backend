const generateId = require('./generateId');

const sessions = new Map();
const defaultTtlMs = Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000);

function now() {
  return Date.now();
}

function purgeExpiredSessions() {
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now()) {
      sessions.delete(token);
    }
  }
}

function createSession({
  type,
  user,
  provider,
  permissions = [],
  externalAccessToken,
  ttlMs = defaultTtlMs,
}) {
  purgeExpiredSessions();

  const prefix = type === 'guest' ? 'guest' : 'user';
  const token = `${prefix}_${generateId()}`;
  const expiresAt = now() + ttlMs;

  const session = {
    token,
    type,
    provider,
    permissions,
    user,
    externalAccessToken,
    createdAt: now(),
    expiresAt,
  };

  sessions.set(token, session);
  return session;
}

function getSession(token) {
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function revokeSession(token) {
  return sessions.delete(token);
}

module.exports = {
  createSession,
  getSession,
  revokeSession,
};
