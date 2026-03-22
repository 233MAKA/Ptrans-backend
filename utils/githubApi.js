const axios = require('axios');

async function exchangeCodeForAccessToken({ code, clientId, clientSecret, redirectUri }) {
  const { data } = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (data.error) {
    const message = data.error_description || data.error;
    throw new Error(`GitHub token exchange failed: ${message}`);
  }

  return data.access_token;
}

async function getGithubAuthenticatedUser(accessToken) {
  const { data } = await axios.get('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  return data;
}

async function revokeGithubOAuthGrant({ accessToken, clientId, clientSecret }) {
  if (!accessToken || !clientId || !clientSecret) return;

  await axios.delete(`https://api.github.com/applications/${clientId}/grant`, {
    auth: {
      username: clientId,
      password: clientSecret,
    },
    data: {
      access_token: accessToken,
    },
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

module.exports = {
  exchangeCodeForAccessToken,
  getGithubAuthenticatedUser,
  revokeGithubOAuthGrant,
};
