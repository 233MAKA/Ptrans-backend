const fs = require('fs');
const path = require('path');

const USERS_FILE_PATH = process.env.USERS_FILE_PATH
  ? path.resolve(process.env.USERS_FILE_PATH)
  : path.resolve(__dirname, '..', 'data', 'users.json');

function ensureUsersFileExists() {
  const dir = path.dirname(USERS_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE_PATH)) fs.writeFileSync(USERS_FILE_PATH, '[]\n', 'utf8');
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeUserRecord(record = {}) {
  return {
    name: normalizeText(record.name),
    email: normalizeLower(record.email),
    githubUsername: normalizeLower(record.githubUsername),
    canEdit: Boolean(record.canEdit),
    canValidate: Boolean(record.canValidate),
    canPublish: Boolean(record.canPublish),
  };
}

function readUsers() {
  ensureUsersFileExists();

  try {
    const raw = fs.readFileSync(USERS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeUserRecord);
  } catch {
    return [];
  }
}

function replaceUsers(users = []) {
  ensureUsersFileExists();

  const normalized = (Array.isArray(users) ? users : [])
    .map(normalizeUserRecord)
    .filter((user) => user.email || user.githubUsername);

  fs.writeFileSync(USERS_FILE_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function findPermissionFlagsByIdentity({ githubUsername, email } = {}) {
  const normalizedUsername = normalizeLower(githubUsername);
  const normalizedEmail = normalizeLower(email);

  const users = readUsers();
  const matchedUser = users.find((user) => {
    const byUsername = Boolean(
      normalizedUsername && user.githubUsername && user.githubUsername === normalizedUsername,
    );
    const byEmail = Boolean(normalizedEmail && user.email && user.email === normalizedEmail);
    return byUsername || byEmail;
  });

  if (!matchedUser) {
    return {
      canEdit: false,
      canValidate: false,
      canPublish: false,
      matched: false,
    };
  }

  return {
    canEdit: Boolean(matchedUser.canEdit),
    canValidate: Boolean(matchedUser.canValidate),
    canPublish: Boolean(matchedUser.canPublish),
    matched: true,
    user: matchedUser,
  };
}

module.exports = {
  USERS_FILE_PATH,
  readUsers,
  replaceUsers,
  findPermissionFlagsByIdentity,
};
