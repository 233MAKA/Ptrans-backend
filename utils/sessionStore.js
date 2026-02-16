const fs = require('fs');
const path = require('path');
const generateId = require('./generateId');

const sessions = new Map();
const defaultTtlMs = Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000);
const SESSIONS_FILE_PATH = process.env.SESSIONS_FILE_PATH
  ? path.resolve(process.env.SESSIONS_FILE_PATH)
  : path.resolve(__dirname, '..', 'data', 'sessions.json');

function now() {
  return Date.now();
}

function ensureSessionsFileExists() {
  const dir = path.dirname(SESSIONS_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SESSIONS_FILE_PATH)) fs.writeFileSync(SESSIONS_FILE_PATH, '[]\n', 'utf8');
}

function persistSessions() {
  ensureSessionsFileExists();
  const serialized = JSON.stringify(Array.from(sessions.values()), null, 2);
  fs.writeFileSync(SESSIONS_FILE_PATH, `${serialized}\n`, 'utf8');
}

function loadSessions() {
  ensureSessionsFileExists();
  try {
    const raw = fs.readFileSync(SESSIONS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    for (const session of parsed) {
      if (!session?.token || !session?.expiresAt) continue;
      if (Number(session.expiresAt) <= now()) continue;
      sessions.set(session.token, session);
    }
  } catch {
    // Keep empty in-memory store if file cannot be read.
  }
}

function purgeExpiredSessions() {
  let changed = false;
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now()) {
      sessions.delete(token);
      changed = true;
    }
  }
  if (changed) persistSessions();
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
  persistSessions();
  return session;
}

function getSession(token) {
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= now()) {
    sessions.delete(token);
    persistSessions();
    return null;
  }

  return session;
}

function revokeSession(token) {
  const removed = sessions.delete(token);
  if (removed) persistSessions();
  return removed;
}

loadSessions();
purgeExpiredSessions();

module.exports = {
  createSession,
  getSession,
  revokeSession,
};
