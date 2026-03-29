import { Router } from 'express';
import { JsonStore } from '../storage/jsonStore.js';

const router = Router();
const store = new JsonStore('defects');

// List
router.get('/', async (req, res) => {
  const { status, run_id, scenario_id, plan_id } = req.query;
  const items = await store.list((item) => {
    if (status && item.status !== status) return false;
    if (run_id && item.run_id !== Number(run_id)) return false;
    if (scenario_id && item.scenario_id !== Number(scenario_id)) return false;
    if (plan_id && item.plan_id !== Number(plan_id)) return false;
    return true;
  });
  items.sort((a, b) => b.id - a.id);
  res.json(items);
});

// Get one
router.get('/:id', async (req, res) => {
  const item = await store.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Defect not found' });
  res.json(item);
});

// Create
router.post('/', async (req, res) => {
  const item = await store.create(
    {
      title: req.body.title || '',
      description: req.body.description || '',
      source_type: req.body.source_type || null,
      source_id: req.body.source_id || null,
      run_id: req.body.run_id || null,
      scenario_id: req.body.scenario_id || null,
      plan_id: req.body.plan_id || null,
      step_id: req.body.step_id || null,
      severity: req.body.severity || 'medium',
      priority: req.body.priority || 'medium',
      status: req.body.status || 'open',
      author: req.user.id,
      assignee: req.body.assignee || null,
      attachments: req.body.attachments || [],
      reproduction_steps: req.body.reproduction_steps || '',
      tags: req.body.tags || [],
      custom_fields: req.body.custom_fields || {},
    },
    req.user.id
  );
  res.status(201).json(item);
});

// Update
router.put('/:id', async (req, res) => {
  const item = await store.update(Number(req.params.id), req.body, req.user.id);
  if (!item) return res.status(404).json({ error: 'Defect not found' });
  res.json(item);
});

// Delete
router.delete('/:id', async (req, res) => {
  const ok = await store.delete(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Defect not found' });
  res.json({ ok: true });
});

export default router;
