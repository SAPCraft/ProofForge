import { Router } from 'express';
import { JsonStore } from '../storage/jsonStore.js';

const router = Router();
const store = new JsonStore('scenarios');

// List with optional filters
router.get('/', async (req, res) => {
  const { status, tags } = req.query;
  const items = await store.list((item) => {
    if (status && item.status !== status) return false;
    if (tags) {
      const wanted = tags.split(',');
      if (!wanted.some((t) => item.tags?.includes(t))) return false;
    }
    return true;
  });
  items.sort((a, b) => b.id - a.id);
  res.json(items);
});

// Get one
router.get('/:id', async (req, res) => {
  const item = await store.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Scenario not found' });
  res.json(item);
});

// Create
router.post('/', async (req, res) => {
  const item = await store.create(
    {
      code: req.body.code || '',
      name: req.body.name || '',
      business_goal: req.body.business_goal || '',
      description: req.body.description || '',
      steps: req.body.steps || [],
      business_context: req.body.business_context || {},
      expected_result: req.body.expected_result || '',
      parent_id: req.body.parent_id || null,
      priority: req.body.priority || 'medium',
      tags: req.body.tags || [],
      version: req.body.version || 1,
      status: req.body.status || 'draft',
      custom_fields: req.body.custom_fields || {},
    },
    req.user.id
  );
  res.status(201).json(item);
});

// Update
router.put('/:id', async (req, res) => {
  const item = await store.update(Number(req.params.id), req.body, req.user.id);
  if (!item) return res.status(404).json({ error: 'Scenario not found' });
  res.json(item);
});

// Copy
router.post('/:id/copy', async (req, res) => {
  const source = await store.get(Number(req.params.id));
  if (!source) return res.status(404).json({ error: 'Scenario not found' });
  const { id, entity_type, created_at, created_by, updated_at, updated_by, ...data } = source;
  const copy = await store.create(
    {
      ...data,
      name: req.body.name || `${source.name} (copy)`,
      parent_id: source.id,
      status: 'draft',
      ...req.body,
    },
    req.user.id
  );
  res.status(201).json(copy);
});

// Delete
router.delete('/:id', async (req, res) => {
  const ok = await store.delete(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Scenario not found' });
  res.json({ ok: true });
});

export default router;
