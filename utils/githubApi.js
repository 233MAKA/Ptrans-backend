const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const GH_API = 'https://api.github.com';

function getProxyAgent() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return proxy ? new HttpsProxyAgent(proxy) : undefined;
}

function ghHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const authToken = token || process.env.GITHUB_REPO_TOKEN;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

function decodeBase64Utf8(value) {
  return Buffer.from(value, 'base64').toString('utf8');
}

function encodeBase64Utf8(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

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
      headers: { Accept: 'application/json' },
      httpsAgent: getProxyAgent(),
      proxy: false,
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
    httpsAgent: getProxyAgent(),
    proxy: false,
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

async function getRepoFile({ owner, repo, path, ref = 'main', token }) {
  const encodedPath = path
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  try {
    const { data } = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/contents/${encodedPath}`,
      {
        headers: ghHeaders(token),
        params: { ref },
        httpsAgent: getProxyAgent(),
        proxy: false,
      },
    );

    return {
      sha: data.sha,
      path: data.path,
      content: data.content ? decodeBase64Utf8(data.content.replace(/\n/g, '')) : '',
    };
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

async function putRepoFile({
  owner,
  repo,
  path,
  content,
  message,
  branch = 'main',
  sha,
  token,
}) {
  const encodedPath = path
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const body = {
    message,
    content: encodeBase64Utf8(content),
    branch,
  };

  if (sha) {
    body.sha = sha;
  }
  
  console.log(`${GH_API}/repos/${owner}/${repo}/contents/${encodedPath}`);
  console.log(body);
  console.log(    
    {
      headers: ghHeaders(token),
      httpsAgent: getProxyAgent(),
      proxy: false,
    });

  const { data } = await axios.put(

    `${GH_API}/repos/${owner}/${repo}/contents/${encodedPath}`,
    body,
    {
      headers: ghHeaders(token),
      httpsAgent: getProxyAgent(),
      proxy: false,
    },
  );

  return data;
}

module.exports = {
  exchangeCodeForAccessToken,
  getGithubAuthenticatedUser,
  revokeGithubOAuthGrant,
  getRepoFile,
  putRepoFile,
};
