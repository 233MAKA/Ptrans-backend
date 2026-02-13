const githubConfig = {
  clientId: process.env.GITHUB_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  callbackUrl:
    process.env.GITHUB_CALLBACK_URL ||
    `${process.env.BACKEND_BASE_URL || 'http://localhost:8091'}/api/auth/github/callback`,
};

const hasGithubOAuthConfig = Boolean(githubConfig.clientId && githubConfig.clientSecret);

module.exports = {
  githubConfig,
  hasGithubOAuthConfig,
};
