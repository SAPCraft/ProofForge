import { Router } from 'express';
import { JsonStore } from '../storage/jsonStore.js';

const router = Router();
const store = new JsonStore('plans');
const runsStore = new JsonStore('runs');

// List
router.get('/', async (req, res) => {
  const { status } = req.query;
  const items = await store.list((item) => {
    if (status && item.status !== status) return false;
    return true;
  });
  items.sort((a, b) => b.id - a.id);
  res.json(items);
});

// Get one
router.get('/:id', async (req, res) => {
  const item = await store.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Plan not found' });
  res.json(item);
});

// Dashboard
router.get('/:id/dashboard', async (req, res) => {
  const plan = await store.get(Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const scenarioEntries = plan.scenarios || [];
  const totalScenarios = scenarioEntries.length;
  const runs = await runsStore.list((r) => r.plan_id === plan.id);

  const scenarioStatus = {};
  for (const entry of scenarioEntries) {
    const sid = entry.scenario_id;
    const scenarioRuns = runs.filter((r) => r.scenario_id === sid);
    // Find the most relevant terminal run
    const terminalRun = scenarioRuns.find((r) => ['completed', 'blocked'].includes(r.status));
    if (terminalRun) {
      // Use run.result (passed/failed/blocked) for finer granularity
      if (terminalRun.status === 'blocked') {
        scenarioStatus[sid] = 'blocked';
      } else if (terminalRun.result === 'failed') {
        scenarioStatus[sid] = 'failed';
      } else {
        scenarioStatus[sid] = 'passed';
      }
    } else if (scenarioRuns.some((r) => r.status === 'in_progress')) {
      scenarioStatus[sid] = 'in_progress';
    } else {
      scenarioStatus[sid] = 'not_started';
    }
  }

  const passed = Object.values(scenarioStatus).filter((s) => s === 'passed').length;
  const blocked = Object.values(scenarioStatus).filter((s) => s === 'blocked').length;
  const failed = Object.values(scenarioStatus).filter((s) => s === 'failed').length;
  const executed = passed + blocked + failed;
  const progress = totalScenarios > 0 ? Math.round((executed / totalScenarios) * 100) : 0;

  res.json({
    plan_id: plan.id,
    total_scenarios: totalScenarios,
    passed,
    blocked,
    failed,
    executed,
    progress,
    scenario_status: scenarioStatus,
  });
});

// Create
router.post('/', async (req, res) => {
  const item = await store.create(
    {
      name: req.body.name || '',
      phase: req.body.phase || 'functional',
      period: req.body.period || {},
      owner: req.body.owner || null,
      scenarios: req.body.scenarios || [],
      status: req.body.status || 'draft',
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
  if (!item) return res.status(404).json({ error: 'Plan not found' });
  res.json(item);
});

// Delete
router.delete('/:id', async (req, res) => {
  const ok = await store.delete(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Plan not found' });
  res.json({ ok: true });
});

export default router;
