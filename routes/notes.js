const express = require('express');
const { getRepoFile, putRepoFile } = require('../utils/githubApi');

const router = express.Router();

const DOCS_OWNER = process.env.GITHUB_DOCS_OWNER;
const DOCS_REPO = process.env.GITHUB_DOCS_REPO;
const DOCS_BRANCH = process.env.GITHUB_DOCS_BRANCH || 'main';
const NOTES_PATH = process.env.GITHUB_NOTES_PATH || 'notes.json';

const { attachSession, requireAuth } = require('../middleware/auth');

function parseNotesFile(content) {
  if (!content || !content.trim()) return {};

  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getEditorIdentity(req) {
  return (
    req.auth?.user?.username ||
    req.auth?.user?.name ||
    req.user?.login ||
    req.user?.username ||
    req.session?.user?.login ||
    'unknown'
  );
}

function getGithubUserToken(req) {
  return req.auth?.provider === 'github' ? req.auth.externalAccessToken : null;
}

async function readNotesDocument(token) {
  const file = await getRepoFile({
    owner: DOCS_OWNER,
    repo: DOCS_REPO,
    path: NOTES_PATH,
    ref: DOCS_BRANCH,
    token,
  });

  if (!file) {
    return {
      sha: null,
      notes: {},
    };
  }

  return {
    sha: file.sha,
    notes: parseNotesFile(file.content),
  };
}

// GET /api/notes
router.get('/', attachSession, async (req, res) => {
  try {
    const { notes } = await readNotesDocument(getGithubUserToken(req));

    res.json({
      notes: Object.fromEntries(
        Object.entries(notes).map(([docId, entry]) => [
          docId,
          {
            note: entry?.note || '',
            updated_at: entry?.updated_at || null,
            updated_by: entry?.updated_by || null,
          },
        ]),
      ),
    });
  } catch (err) {
    console.error('Failed to load notes');
    console.error('status:', err.response?.status);
    console.error('data:', err.response?.data);
    console.error('message:', err.message);

    res.status(err.response?.status || 500).json({
      message: err.response?.data?.message || err.message || 'Failed to load notes',
    });
  }
});

// GET /api/notes/:docId
router.get('/:docId', attachSession, async (req, res) => {
  console.log('GET /api/notes hit', req.params.docId);
  try {
    const { docId } = req.params;

    const { notes } = await readNotesDocument(getGithubUserToken(req));
    const entry = notes[docId] || null;

    res.json({
      docId,
      note: entry?.note || '',
      updated_at: entry?.updated_at || null,
      updated_by: entry?.updated_by || null,
    });
    } catch (err) {
    console.error('Failed to save note');
    console.error('status:', err.response?.status);
    console.error('data:', err.response?.data);
    console.error('message:', err.message);
    console.error('owner:', DOCS_OWNER);
    console.error('repo:', DOCS_REPO);
    console.error('branch:', DOCS_BRANCH);
    console.error('path:', NOTES_PATH);

    res.status(err.response?.status || 500).json({
        message: err.response?.data?.message || err.message || 'Failed to save note',
    });
    }
});

// PUT /api/notes/:docId
router.put('/:docId', requireAuth, express.json(), async (req, res) => {
  console.log('PUT /api/notes hit', req.params.docId, req.body);
    try {
    const { docId } = req.params;
    const note = typeof req.body?.note === 'string' ? req.body.note : '';

    const githubUserToken = getGithubUserToken(req);
    if (!githubUserToken) {
      return res.status(401).json({ message: 'GitHub user token missing; please sign in again' });
    }

    const { sha, notes } = await readNotesDocument(githubUserToken);

    notes[docId] = {
      note,
      updated_at: new Date().toISOString(),
      updated_by: getEditorIdentity(req),
    };

    const serialized = JSON.stringify(notes, null, 2) + '\n';

    const title = await getDocumentTitle(docId, githubUserToken);

    await putRepoFile({
      owner: DOCS_OWNER,
      repo: DOCS_REPO,
      path: NOTES_PATH,
      content: serialized,
      message: `Update note for ${title}`,
      branch: DOCS_BRANCH,
      sha,
      token: githubUserToken,
    });

    res.json({
      docId,
      note: notes[docId].note,
      updated_at: notes[docId].updated_at,
      updated_by: notes[docId].updated_by,
    });
    } catch (err) {
    console.error('Failed to save note');
    console.error('status:', err.response?.status);
    console.error('data:', err.response?.data);
    console.error('message:', err.message);
    console.error('owner:', DOCS_OWNER);
    console.error('repo:', DOCS_REPO);
    console.error('branch:', DOCS_BRANCH);
    console.error('path:', NOTES_PATH);

    res.status(err.response?.status || 500).json({
        message: err.response?.data?.message || err.message || 'Failed to save note',
    });
    }
});

router.get('/_debug/file', async (_req, res) => {
  try {
    const file = await getRepoFile({
      owner: DOCS_OWNER,
      repo: DOCS_REPO,
      path: NOTES_PATH,
      ref: DOCS_BRANCH,
    });

    res.json({
      owner: DOCS_OWNER,
      repo: DOCS_REPO,
      branch: DOCS_BRANCH,
      path: NOTES_PATH,
      found: !!file,
      sha: file?.sha || null,
      preview: file?.content || '',
    });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
      owner: DOCS_OWNER,
      repo: DOCS_REPO,
      branch: DOCS_BRANCH,
      path: NOTES_PATH,
    });
  }
});

async function getDocumentTitle(docId, token) {
  const file = await getRepoFile({
    owner: DOCS_OWNER,
    repo: DOCS_REPO,
    path: 'index.json',
    ref: DOCS_BRANCH,
    token,
  });

  if (!file) return docId;

  try {
    const docs = JSON.parse(file.content);
    const doc = docs.find((d) => d.id === docId);
    return doc?.title || docId;
  } catch {
    return docId;
  }
}

module.exports = router;
