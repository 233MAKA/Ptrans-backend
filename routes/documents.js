const express = require('express');

const { attachSession, hasPermission, requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

const { getRepoFile, putRepoFile } = require('../utils/githubApi');

const DOCS_OWNER = process.env.GITHUB_DOCS_OWNER;
const DOCS_REPO = process.env.GITHUB_DOCS_REPO;
const DOCS_BRANCH = process.env.GITHUB_DOCS_BRANCH || 'main';
const INDEX_PATH = process.env.GITHUB_INDEX_PATH || 'index.json';

router.get('/', attachSession, (req, res) => {
  const baseItems = [{ id: 'doc-1', title: 'Public sample document', visibility: 'public' }];

  if (!req.auth || !hasPermission(req.auth, 'documents:read')) {
    return res.status(200).json({ mode: 'public', items: baseItems });
  }

  return res.status(200).json({
    mode: req.auth.type,
    items: [...baseItems, { id: 'doc-2', title: 'Team working draft', visibility: 'private' }],
  });
});

router.post('/', requireAuth, requirePermission('documents:edit'), (req, res) => {
  const { title } = req.body || {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ message: 'title is required' });
  }

  return res.status(201).json({
    id: `doc-${Date.now()}`,
    title,
    owner: req.auth.user.username || req.auth.user.name,
  });
});

module.exports = router;

function normalizeStatusForRepo(status) {
  const value = String(status || '').trim().toLowerCase();

  if (value === 'draft' || value === 'drafts') return 'drafts';
  if (
    value === 'submitted' ||
    value === 'submitted for review' ||
    value === 'under review'
  ) {
    return 'submitted';
  }
  if (value === 'reviewed') return 'reviewed';
  if (value === 'published') return 'published';

  throw new Error(`Unsupported status: ${status}`);
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function getGithubUserToken(req) {
  return req.auth?.provider === 'github' ? req.auth.externalAccessToken : null;
}

async function readIndexDocument(token) {
  const file = await getRepoFile({
    owner: DOCS_OWNER,
    repo: DOCS_REPO,
    path: INDEX_PATH,
    ref: DOCS_BRANCH,
    token,
  });

  if (!file) {
    throw new Error(`index.json not found`);
  }

  let docs;
  try {
    docs = JSON.parse(file.content);
  } catch {
    throw new Error(`Invalid JSON in index.json`);
  }

  if (!Array.isArray(docs)) {
    throw new Error(`index.json must be an array`);
  }

  return {
    sha: file.sha,
    docs,
  };
}

router.put(
  '/:docId/status',
  requireAuth,
  requirePermission('documents:edit'),
  express.json(),
  async (req, res) => {
    console.log('PUT /api/documents/:docId/status', req.params.docId, req.body);

    try {
      const { docId } = req.params;
      const requestedStatus = req.body?.status;

      const nextStatus = normalizeStatusForRepo(requestedStatus);

      const githubUserToken = getGithubUserToken(req);
      if (!githubUserToken) {
        return res.status(401).json({ message: 'GitHub user token missing; please sign in again' });
      }

      const { sha, docs } = await readIndexDocument(githubUserToken);

      const doc = docs.find((d) => d.id === docId);
      if (!doc) {
        return res.status(404).json({ message: `Document not found: ${docId}` });
      }

      doc.status = nextStatus;
      doc.last_modified = formatTimestamp();

      const serialized = JSON.stringify(docs, null, 2) + '\n';

      await putRepoFile({
        owner: DOCS_OWNER,
        repo: DOCS_REPO,
        path: INDEX_PATH,
        content: serialized,
        message: `Update status for ${doc.title} → ${nextStatus}`,
        branch: DOCS_BRANCH,
        sha,
        token: githubUserToken,
      });

      res.json({
        id: doc.id,
        status: doc.status,
        last_modified: doc.last_modified,
      });
    } catch (err) {
      console.error('Failed to update status');
      console.error('status:', err.response?.status);
      console.error('data:', err.response?.data);
      console.error('message:', err.message);

      res.status(err.response?.status || 500).json({
        message:
          err.response?.data?.message ||
          err.message ||
          'Failed to update document status',
      });
    }
  }
);
