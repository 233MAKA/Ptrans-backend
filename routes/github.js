const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const router = express.Router();

const GH_API = 'https://api.github.com';

function ghHeaders() {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_REPO_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_REPO_TOKEN}`;
  }
  return headers;
}

function getProxyAgent() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return proxy ? new HttpsProxyAgent(proxy) : undefined;
}

async function getRepoContents(req, res) {
  const { owner, repo } = req.params;
  const pathParts = req.params.path;
  const path = Array.isArray(pathParts) ? pathParts.join('/') : pathParts || '';
  try {
    const { data } = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/contents/${path}`,
      { headers: ghHeaders(), httpsAgent: getProxyAgent(), proxy: false },
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
}

// GET /api/github/contents/:owner/:repo/*path
router.get('/contents/:owner/:repo', getRepoContents);
router.get('/contents/:owner/:repo/*path', getRepoContents);

// GET /api/github/commits?owner=&repo=&path=
router.get('/commits', async (req, res) => {
  const { owner, repo, path } = req.query;
  try {
    const { data } = await axios.get(
      `${GH_API}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
      { headers: ghHeaders(), httpsAgent: getProxyAgent(), proxy: false },
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

// GET /api/github/raw/:owner/:repo/:ref/*path
router.get('/raw/:owner/:repo/:ref/*path', async (req, res) => {
  const { owner, repo, ref } = req.params;
  const pathParts = req.params.path;
  const path = Array.isArray(pathParts) ? pathParts.join('/') : pathParts || '';
  try {
    const { data } = await axios.get(
      `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
      { responseType: 'text', httpsAgent: getProxyAgent(), proxy: false },
    );
    res.send(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

module.exports = router;
