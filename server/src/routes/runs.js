import { Router } from 'express';
import { JsonStore } from '../storage/jsonStore.js';

const router = Router();
const store = new JsonStore('runs');
const scenarioStore = new JsonStore('scenarios');

const TERMINAL_STATUSES = ['passed', 'passed_with_comments', 'failed', 'blocked', 'skipped'];

function tryAutoCompleteRun(run) {
  if (run.status !== 'in_progress') return;
  const snapshot = run.scenario_snapshot;
  const allDone = run.step_executions.every((se) => {
    const stepDef = (snapshot.steps || []).find(
      (s) => (s.id || `step_${snapshot.steps.indexOf(s) + 1}`) === se.step_id
    );
    const isOptional = stepDef && stepDef.mandatory === false;
    return isOptional || TERMINAL_STATUSES.includes(se.current_status);
  });
  if (!allDone) return;
  const anyFailed = run.step_executions.some((se) => se.current_status === 'failed');
  const anyBlocked = run.step_executions.some((se) => se.current_status === 'blocked');
  if (anyBlocked) {
    run.status = 'blocked';
  } else {
    run.status = 'completed';
  }
  run.completed_at = new Date().toISOString();
  run.result = anyFailed ? 'failed' : anyBlocked ? 'blocked' : 'passed';
}

// List
router.get('/', async (req, res) => {
  const { plan_id, scenario_id, status } = req.query;
  const items = await store.list((item) => {
    if (status && item.status !== status) return false;
    if (plan_id && item.plan_id !== Number(plan_id)) return false;
    if (scenario_id && item.scenario_id !== Number(scenario_id)) return false;
    return true;
  });
  items.sort((a, b) => b.id - a.id);
  res.json(items);
});

// Get one
router.get('/:id', async (req, res) => {
  const item = await store.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Run not found' });
  res.json(item);
});

// Create run from scenario
router.post('/', async (req, res) => {
  const { scenario_id, plan_id } = req.body;
  if (!scenario_id) return res.status(400).json({ error: 'scenario_id is required' });

  const scenario = await scenarioStore.get(Number(scenario_id));
  if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

  // Normalize step IDs: ensure every step has a stable id before snapshotting
  const snapshotSteps = (scenario.steps || []).map((step, i) => ({
    ...step,
    id: step.id || `step_${i + 1}`,
    order: step.order ?? i + 1,
  }));
  const snapshotScenario = { ...scenario, steps: snapshotSteps };

  const stepExecutions = snapshotSteps.map((step, i) => ({
    step_id: step.id,
    step_index: i,
    attempts: [],
    current_status: 'not_started',
  }));

  const item = await store.create(
    {
      scenario_id: scenario.id,
      plan_id: plan_id || null,
      scenario_snapshot: snapshotScenario,
      assignees: req.body.assignees || [],
      planned_date: req.body.planned_date || null,
      started_at: null,
      completed_at: null,
      status: 'planned',
      step_executions: stepExecutions,
      result: null,
      comment: req.body.comment || '',
      tags: req.body.tags || [],
      custom_fields: req.body.custom_fields || {},
    },
    req.user.id
  );
  res.status(201).json(item);
});

// Update run (status, comment, etc)
router.put('/:id', async (req, res) => {
  const item = await store.update(Number(req.params.id), req.body, req.user.id);
  if (!item) return res.status(404).json({ error: 'Run not found' });
  res.json(item);
});

// Execute a step (create new attempt)
router.post('/:id/steps/:stepId/execute', async (req, res) => {
  const run = await store.get(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const stepExec = run.step_executions.find((s) => s.step_id === req.params.stepId);
  if (!stepExec) return res.status(404).json({ error: 'Step not found in run' });

  if (run.status === 'planned') {
    run.status = 'in_progress';
    run.started_at = new Date().toISOString();
  }

  const attemptNum = stepExec.attempts.length + 1;
  const attempt = {
    attempt_number: attemptNum,
    executor: req.user.id,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: req.body.status || 'in_progress',
    actual_parameters: req.body.actual_parameters || {},
    comment: req.body.comment || '',
    attachments: [],
    sap_objects: req.body.sap_objects || [],
    validations: [],
  };

  if (TERMINAL_STATUSES.includes(attempt.status)) {
    attempt.completed_at = new Date().toISOString();
  }

  stepExec.attempts.push(attempt);
  stepExec.current_status = attempt.status;

  tryAutoCompleteRun(run);

  const updated = await store.update(run.id, run, req.user.id);
  res.json(updated);
});

// Update a step attempt
router.put('/:id/steps/:stepId/attempts/:attemptNum', async (req, res) => {
  const run = await store.get(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const stepExec = run.step_executions.find((s) => s.step_id === req.params.stepId);
  if (!stepExec) return res.status(404).json({ error: 'Step not found' });

  const attempt = stepExec.attempts.find((a) => a.attempt_number === Number(req.params.attemptNum));
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  Object.assign(attempt, req.body);

  if (!attempt.completed_at && TERMINAL_STATUSES.includes(attempt.status)) {
    attempt.completed_at = new Date().toISOString();
  }

  stepExec.current_status = stepExec.attempts[stepExec.attempts.length - 1].status;

  tryAutoCompleteRun(run);

  const updated = await store.update(run.id, run, req.user.id);
  res.json(updated);
});

// Add validation to a step attempt
router.post('/:id/steps/:stepId/attempts/:attemptNum/validations', async (req, res) => {
  const run = await store.get(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const stepExec = run.step_executions.find((s) => s.step_id === req.params.stepId);
  if (!stepExec) return res.status(404).json({ error: 'Step not found' });

  const attempt = stepExec.attempts.find((a) => a.attempt_number === Number(req.params.attemptNum));
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const validation = {
    id: `val_${Date.now()}`,
    name: req.body.name || '',
    description: req.body.description || '',
    validator: req.body.validator || req.user.id,
    status: req.body.status || 'pending',
    comment: req.body.comment || '',
    attachments: req.body.attachments || [],
    created_at: new Date().toISOString(),
  };

  attempt.validations.push(validation);
  const updated = await store.update(run.id, run, req.user.id);
  res.json(updated);
});

// Update validation
router.put('/:id/steps/:stepId/attempts/:attemptNum/validations/:valId', async (req, res) => {
  const run = await store.get(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const stepExec = run.step_executions.find((s) => s.step_id === req.params.stepId);
  if (!stepExec) return res.status(404).json({ error: 'Step not found' });

  const attempt = stepExec.attempts.find((a) => a.attempt_number === Number(req.params.attemptNum));
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const val = attempt.validations.find((v) => v.id === req.params.valId);
  if (!val) return res.status(404).json({ error: 'Validation not found' });

  Object.assign(val, req.body, { id: val.id, created_at: val.created_at });
  const updated = await store.update(run.id, run, req.user.id);
  res.json(updated);
});

// Delete
router.delete('/:id', async (req, res) => {
  const ok = await store.delete(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Run not found' });
  res.json({ ok: true });
});

export default router;
