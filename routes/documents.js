const express = require('express');

const { attachSession, hasPermission, requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

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
