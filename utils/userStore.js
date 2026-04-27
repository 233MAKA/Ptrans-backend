const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function runGit(args, cwd) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getGitErrorOutput(result) {
  if (!result) return 'Unknown git error';
  if (result.error?.message) return result.error.message;
  return (result.stderr || result.stdout || 'Unknown git error').trim();
}

function getGitRepositoryRoot(filePath) {
  const cwd = path.dirname(filePath);
  const result = runGit(['rev-parse', '--show-toplevel'], cwd);

  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function getUsersFileRelativePath(repoRoot, usersFilePath) {
  const relativePath = path.relative(repoRoot, usersFilePath);
  if (!relativePath || relativePath.startsWith('..')) return '';
  return relativePath.split(path.sep).join('/');
}

function getCurrentGitBranch(repoRoot) {
  const result = runGit(['branch', '--show-current'], repoRoot);
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function getRemoteUrl(repoRoot, remoteName = 'origin') {
  const result = runGit(['remote', 'get-url', remoteName], repoRoot);
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function getAuthenticatedPushUrl(remoteUrl, token) {
  if (!remoteUrl || !token) return '';

  const normalizedToken = String(token).trim();
  if (!normalizedToken) return '';

  if (remoteUrl.startsWith('git@github.com:')) {
    const repoPath = remoteUrl.slice('git@github.com:'.length);
    return `https://x-access-token:${normalizedToken}@github.com/${repoPath}`;
  }

  if (remoteUrl.startsWith('https://github.com/')) {
    return remoteUrl.replace('https://github.com/', `https://x-access-token:${normalizedToken}@github.com/`);
  }

  return '';
}

function buildGithubNoReplyEmail(actor = {}) {
  const githubUsername = normalizeLower(actor.githubUsername || actor.username);
  const githubId = normalizeText(actor.githubId);

  if (!githubUsername) return '';
  if (githubId) return `${githubId}+${githubUsername}@users.noreply.github.com`;
  return `${githubUsername}@users.noreply.github.com`;
}

function normalizeGitActor(actor = {}) {
  const githubUsername = normalizeLower(actor.githubUsername || actor.username);
  const displayName = normalizeText(actor.name);
  const email = normalizeLower(actor.email) || buildGithubNoReplyEmail(actor);

  return {
    name: githubUsername || displayName,
    email,
  };
}

function getCommitArgs({ relativePath, commitMessage, actor }) {
  const args = [];
  const normalizedActor = normalizeGitActor(actor);

  if (normalizedActor.name) {
    args.push('-c', `user.name=${normalizedActor.name}`);
  }

  if (normalizedActor.email) {
    args.push('-c', `user.email=${normalizedActor.email}`);
  }

  args.push('commit', '-m', commitMessage, '--', relativePath);
  return args;
}

function autoCommitUsersFile(usersFilePath, actor) {
  if (process.env.USERS_GIT_AUTOCOMMIT === 'false') return;

  const repoRoot = getGitRepositoryRoot(usersFilePath);
  if (!repoRoot) return;

  const relativePath = getUsersFileRelativePath(repoRoot, usersFilePath);
  if (!relativePath) return;

  const trackedResult = runGit(['ls-files', '--error-unmatch', '--', relativePath], repoRoot);
  if (trackedResult.status !== 0) return;

  const addResult = runGit(['add', '--', relativePath], repoRoot);
  if (addResult.status !== 0) {
    console.error(`Failed to stage ${relativePath}:`, getGitErrorOutput(addResult));
    return;
  }

  const diffResult = runGit(['diff', '--cached', '--quiet', '--', relativePath], repoRoot);
  if (diffResult.status === 0) return;

  if (![0, 1].includes(diffResult.status)) {
    console.error(
      `Failed to inspect staged changes for ${relativePath}:`,
      getGitErrorOutput(diffResult),
    );
    return;
  }

  const commitMessage = process.env.USERS_GIT_COMMIT_MESSAGE || 'chore(users): update users.json';
  const commitResult = runGit(getCommitArgs({ relativePath, commitMessage, actor }), repoRoot);

  if (commitResult.status !== 0) {
    console.error(
      `Failed to auto-commit ${relativePath}:`,
      getGitErrorOutput(commitResult),
    );
    return;
  }

  if (process.env.USERS_GIT_AUTOPUSH === 'false') return;

  const currentBranch = process.env.USERS_GIT_BRANCH || getCurrentGitBranch(repoRoot);
  if (!currentBranch) {
    console.error(`Failed to detect Git branch for ${relativePath}; skipping auto-push.`);
    return;
  }

  const remoteName = process.env.USERS_GIT_REMOTE || 'origin';
  const remoteUrl = getRemoteUrl(repoRoot, remoteName);
  const authenticatedPushUrl = getAuthenticatedPushUrl(remoteUrl, process.env.GITHUB_REPO_TOKEN);
  const pushTarget = authenticatedPushUrl || remoteName;
  const pushResult = runGit(['push', pushTarget, currentBranch], repoRoot);
  if (pushResult.status !== 0) {
    console.error(
      `Failed to auto-push ${relativePath}:`,
      getGitErrorOutput(pushResult),
    );
  }
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

function replaceUsers(users = [], options = {}) {
  ensureUsersFileExists();
  const usersFilePath = getUsersFilePath();

  const normalized = (Array.isArray(users) ? users : [])
    .map(normalizeUserRecord)
    .filter((user) => user.githubId || user.email || user.githubUsername);

  fs.writeFileSync(usersFilePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  autoCommitUsersFile(usersFilePath, options.actor);
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
