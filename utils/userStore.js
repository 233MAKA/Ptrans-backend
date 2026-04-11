const fs = require('fs');
const path = require('path');

const configuredUsersFilePath = process.env.USERS_FILE_PATH
  ? path.resolve(process.env.USERS_FILE_PATH)
  : '';
const defaultUsersFilePath = path.resolve(__dirname, '..', '..', '..', '..', 'dashboard-data-admin', 'users.json');
const fallbackUsersFilePath = path.resolve(__dirname, '..', 'data', 'users.json');
const USERS_FILE_PATH = configuredUsersFilePath ||
  (fs.existsSync(path.dirname(defaultUsersFilePath)) ? defaultUsersFilePath : fallbackUsersFilePath);

function getUsersFilePath() {
  return USERS_FILE_PATH;
}

function ensureUsersFileExists() {
  const usersFilePath = getUsersFilePath();
  const dir = path.dirname(usersFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(usersFilePath)) fs.writeFileSync(usersFilePath, '[]\n', 'utf8');
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeGithubId(value = '') {
  return normalizeText(value);
}

function normalizeUserRecord(record = {}) {
  const isAdmin = Boolean(record.isAdmin);

  return {
    githubId: normalizeGithubId(record.githubId),
    name: normalizeText(record.name),
    email: normalizeLower(record.email),
    githubUsername: normalizeLower(record.githubUsername),
    isAdmin,
    canEdit: isAdmin ? false : Boolean(record.canEdit),
    canValidate: isAdmin ? false : Boolean(record.canValidate),
    canPublish: isAdmin ? false : Boolean(record.canPublish),
  };
}

function readUsers() {
  ensureUsersFileExists();
  const usersFilePath = getUsersFilePath();

  try {
    const raw = fs.readFileSync(usersFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeUserRecord);
  } catch (error) {
    console.error(`Failed to read users from ${usersFilePath}:`, error.message);
    return [];
  }
}

function replaceUsers(users = []) {
  ensureUsersFileExists();
  const usersFilePath = getUsersFilePath();

  const normalized = (Array.isArray(users) ? users : [])
    .map(normalizeUserRecord)
    .filter((user) => user.githubId || user.email || user.githubUsername);

  fs.writeFileSync(usersFilePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function findPermissionFlagsByIdentity({ githubId, githubUsername, email } = {}) {
  const normalizedGithubId = normalizeGithubId(githubId);
  const normalizedUsername = normalizeLower(githubUsername);
  const normalizedEmail = normalizeLower(email);

  const users = readUsers();
  const matchedUser = users.find((user) => {
    const byGithubId = Boolean(normalizedGithubId && user.githubId && user.githubId === normalizedGithubId);
    const byUsername = Boolean(
      normalizedUsername && user.githubUsername && user.githubUsername === normalizedUsername,
    );
    const byEmail = Boolean(normalizedEmail && user.email && user.email === normalizedEmail);
    return byGithubId || byUsername || byEmail;
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
    isAdmin: Boolean(matchedUser.isAdmin),
    canEdit: Boolean(matchedUser.isAdmin || matchedUser.canEdit),
    canValidate: Boolean(matchedUser.isAdmin || matchedUser.canValidate),
    canPublish: Boolean(matchedUser.isAdmin || matchedUser.canPublish),
    matched: true,
    user: matchedUser,
  };
}

function ensureUserExists(user = {}) {
  const normalizedCandidate = normalizeUserRecord({
    githubId: user.githubId,
    name: user.name,
    email: user.email,
    githubUsername: user.githubUsername,
    isAdmin: false,
    canEdit: false,
    canValidate: false,
    canPublish: false,
  });

  if (
    !normalizedCandidate.githubId &&
    !normalizedCandidate.email &&
    !normalizedCandidate.githubUsername
  ) {
    return null;
  }

  const users = readUsers();
  const existing = users.find((entry) => {
    const sameGithubId = Boolean(
      normalizedCandidate.githubId && entry.githubId && entry.githubId === normalizedCandidate.githubId,
    );
    const sameGithub = Boolean(
      normalizedCandidate.githubUsername &&
        entry.githubUsername &&
        entry.githubUsername === normalizedCandidate.githubUsername,
    );
    const sameEmail = Boolean(
      normalizedCandidate.email && entry.email && entry.email === normalizedCandidate.email,
    );
    return sameGithubId || sameGithub || sameEmail;
  });

  if (existing) {
    const mergedUser = normalizeUserRecord({
      ...existing,
      // Preserve admin-managed fields when they are already stored.
      githubId: existing.githubId || normalizedCandidate.githubId,
      name: existing.name || normalizedCandidate.name,
      email: existing.email || normalizedCandidate.email,
      githubUsername: existing.githubUsername || normalizedCandidate.githubUsername,
    });

    const hasChanged =
      mergedUser.githubId !== existing.githubId ||
      mergedUser.name !== existing.name ||
      mergedUser.email !== existing.email ||
      mergedUser.githubUsername !== existing.githubUsername;

    if (!hasChanged) return existing;

    const nextUsers = users.map((entry) => {
      if (entry === existing) return mergedUser;
      return entry;
    });

    replaceUsers(nextUsers);
    return mergedUser;
  }

  const nextUsers = [...users, normalizedCandidate];
  replaceUsers(nextUsers);
  return normalizedCandidate;
}

module.exports = {
  USERS_FILE_PATH,
  ensureUserExists,
  readUsers,
  replaceUsers,
  findPermissionFlagsByIdentity,
};
