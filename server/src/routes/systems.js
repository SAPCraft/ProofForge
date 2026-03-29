import { Router } from 'express';
import { JsonStore } from '../storage/jsonStore.js';

const router = Router();
const store = new JsonStore('systems');

// List
router.get('/', async (req, res) => {
  const items = await store.list();
  // Strip passwords from list response
  const safe = items.map((s) => ({ ...s, password: s.password ? '••••••' : '' }));
  safe.sort((a, b) => a.id - b.id);
  res.json(safe);
});

// Get one (with password for internal use)
router.get('/:id', async (req, res) => {
  const item = await store.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'System not found' });
  res.json(item);
});

// Get one with full credentials (for SAP fetch)
router.get('/:id/credentials', async (req, res) => {
  const item = await store.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'System not found' });
  res.json({
    base_url: item.base_url,
    client: item.client,
    language: item.language,
    user: item.user,
    password: item.password,
  });
});

// Create
router.post('/', async (req, res) => {
  const item = await store.create({
    name: req.body.name || '',
    description: req.body.description || '',
    base_url: req.body.base_url || '',
    client: req.body.client || '000',
    language: req.body.language || 'EN',
    user: req.body.user || '',
    password: req.body.password || '',
    tags: req.body.tags || [],
    custom_fields: req.body.custom_fields || {},
  }, req.user.id);
  res.status(201).json(item);
});

// Update
router.put('/:id', async (req, res) => {
  // If password is masked, don't overwrite
  const data = { ...req.body };
  if (data.password === '••••••') delete data.password;
  const item = await store.update(Number(req.params.id), data, req.user.id);
  if (!item) return res.status(404).json({ error: 'System not found' });
  res.json(item);
});

// Delete
router.delete('/:id', async (req, res) => {
  const ok = await store.delete(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'System not found' });
  res.json({ ok: true });
});

export default router;
