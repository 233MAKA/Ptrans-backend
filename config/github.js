const githubConfig = {
  clientId: process.env.GITHUB_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  callbackUrl:
    process.env.GITHUB_CALLBACK_URL ||
    `${process.env.BACKEND_BASE_URL || 'http://localhost:8091'}/api/auth/github/callback`,
};

const hasGithubOAuthConfig = Boolean(githubConfig.clientId && githubConfig.clientSecret);

// repo: read/write repository files (required by leafwriter to save documents)
// read:org: list organizations and their repos
const GITHUB_OAUTH_SCOPE = 'read:user user:email repo read:org';

module.exports = {
  githubConfig,
  hasGithubOAuthConfig,
  GITHUB_OAUTH_SCOPE,
};
