const express = require('express');
const { getRepoFile, putRepoFile } = require('../utils/githubApi');

const router = express.Router();

const DOCS_OWNER = process.env.GITHUB_DOCS_OWNER;
const DOCS_REPO = process.env.GITHUB_DOCS_REPO;
const DOCS_BRANCH = process.env.GITHUB_DOCS_BRANCH || 'main';
const NOTES_PATH = process.env.GITHUB_NOTES_PATH || 'notes.json';

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
    req.user?.email ||
    req.user?.login ||
    req.user?.username ||
    req.session?.user?.email ||
    req.session?.user?.login ||
    'unknown'
  );
}

async function readNotesDocument() {
  const file = await getRepoFile({
    owner: DOCS_OWNER,
    repo: DOCS_REPO,
    path: NOTES_PATH,
    ref: DOCS_BRANCH,
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

// GET /api/notes/:docId
router.get('/:docId', async (req, res) => {
  console.log('GET /api/notes hit', req.params.docId);
  try {
    const { docId } = req.params;

    const { notes } = await readNotesDocument();
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
router.put('/:docId', express.json(), async (req, res) => {
  console.log('PUT /api/notes hit', req.params.docId, req.body);
    try {
    const { docId } = req.params;
    const note = typeof req.body?.note === 'string' ? req.body.note : '';

    const { sha, notes } = await readNotesDocument();

    notes[docId] = {
      note,
      updated_at: new Date().toISOString(),
      updated_by: getEditorIdentity(req),
    };

    const serialized = JSON.stringify(notes, null, 2) + '\n';

    await putRepoFile({
      owner: DOCS_OWNER,
      repo: DOCS_REPO,
      path: NOTES_PATH,
      content: serialized,
      message: `Update note for ${docId}`,
      branch: DOCS_BRANCH,
      sha,
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

module.exports = router;