import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import JsonEditor from '../../components/JsonEditor.jsx';

const STATUSES = ['draft', 'approved', 'active', 'completed', 'cancelled'];
const PHASES = ['functional', 'integration', 'uat'];

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [tab, setTab] = useState('scenarios');
  const [addScenarioId, setAddScenarioId] = useState('');
  const [allScenarios, setAllScenarios] = useState([]);

  const load = async () => {
    const [plan, dash, allSc] = await Promise.all([
      api.get(`/plans/${id}`),
      api.get(`/plans/${id}/dashboard`),
      api.get('/scenarios'),
    ]);
    setItem(plan);
    setDashboard(dash);
    setAllScenarios(allSc);
    // Resolve scenario names
    const resolved = (plan.scenarios || []).map((entry) => {
      const sc = allSc.find((s) => s.id === entry.scenario_id);
      return { ...entry, scenario: sc };
    });
    setScenarios(resolved);
  };
  useEffect(() => { load(); }, [id]);

  if (!item) return <div className="loading">Loading...</div>;

  const save = async (data) => {
    const updated = await api.put(`/plans/${id}`, data);
    setItem(updated);
  };

  const addScenario = async () => {
    const sid = Number(addScenarioId);
    if (!sid) return;
    if (item.scenarios?.some((s) => s.scenario_id === sid)) return;
    const newScenarios = [...(item.scenarios || []), { scenario_id: sid, assignee: null, priority: 'medium' }];
    await save({ ...item, scenarios: newScenarios });
    setAddScenarioId('');
    load();
  };

  const removeScenario = async (sid) => {
    const newScenarios = item.scenarios.filter((s) => s.scenario_id !== sid);
    await save({ ...item, scenarios: newScenarios });
    load();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this plan?')) return;
    await api.delete(`/plans/${id}`);
    navigate('/plans');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate('/plans')}>Plans</a>
          <span>/</span>
          <span>#{item.id}</span>
        </div>
        <div className="page-actions">
          <button className="btn btn-danger-ghost" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <input
            className="inline-edit title-edit"
            value={item.name}
            onChange={(e) => save({ ...item, name: e.target.value })}
          />
          <div className="card-meta">
            <select value={item.status} onChange={(e) => save({ ...item, status: e.target.value })} className="status-select">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={item.phase} onChange={(e) => save({ ...item, phase: e.target.value })} className="phase-select">
              {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {dashboard && (
          <div className="dashboard-strip">
            <div className="dash-stat">
              <span className="dash-num">{dashboard.total_scenarios}</span>
              <span className="dash-label">Total</span>
            </div>
            <div className="dash-stat completed">
              <span className="dash-num">{dashboard.passed}</span>
              <span className="dash-label">Passed</span>
            </div>
            <div className="dash-stat failed">
              <span className="dash-num">{dashboard.failed}</span>
              <span className="dash-label">Failed</span>
            </div>
            <div className="dash-stat blocked">
              <span className="dash-num">{dashboard.blocked}</span>
              <span className="dash-label">Blocked</span>
            </div>
            <div className="dash-stat">
              <span className="dash-num">{dashboard.progress}%</span>
              <span className="dash-label">Progress</span>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar" style={{ width: `${dashboard.progress}%` }} />
            </div>
          </div>
        )}

        <div className="tabs">
          <button className={tab === 'scenarios' ? 'tab active' : 'tab'} onClick={() => setTab('scenarios')}>Scenarios</button>
          <button className={tab === 'info' ? 'tab active' : 'tab'} onClick={() => setTab('info')}>Info</button>
          <button className={tab === 'json' ? 'tab active' : 'tab'} onClick={() => setTab('json')}>JSON</button>
        </div>

        {tab === 'scenarios' && (
          <div className="plan-scenarios">
            <div className="add-scenario-row">
              <select value={addScenarioId} onChange={(e) => setAddScenarioId(e.target.value)}>
                <option value="">Select scenario to add...</option>
                {allScenarios
                  .filter((s) => !item.scenarios?.some((e) => e.scenario_id === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>#{s.id} {s.name}</option>
                  ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={addScenario}>Add</button>
            </div>
            <div className="entity-table">
              <div className="table-header">
                <span className="col-id">ID</span>
                <span className="col-name">Scenario</span>
                <span className="col-status">Run Status</span>
                <span className="col-actions">Actions</span>
              </div>
              {scenarios.map((entry) => (
                <div key={entry.scenario_id} className="table-row">
                  <span className="col-id">#{entry.scenario_id}</span>
                  <span className="col-name">
                    <Link to={`/scenarios/${entry.scenario_id}`}>
                      {entry.scenario?.name || `Scenario #${entry.scenario_id}`}
                    </Link>
                  </span>
                  <span className="col-status">
                    <StatusBadge status={dashboard?.scenario_status?.[entry.scenario_id] || 'not_started'} />
                  </span>
                  <span className="col-actions">
                    <button className="btn-icon" onClick={() => removeScenario(entry.scenario_id)} title="Remove">×</button>
                  </span>
                </div>
              ))}
              {scenarios.length === 0 && <div className="table-empty">No scenarios in this plan</div>}
            </div>
          </div>
        )}

        {tab === 'info' && (
          <div className="info-section">
            <div className="form-group">
              <label>Owner</label>
              <input value={item.owner || ''} onChange={(e) => save({ ...item, owner: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Tags (comma separated)</label>
              <input
                value={(item.tags || []).join(', ')}
                onChange={(e) => save({ ...item, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              />
            </div>
          </div>
        )}

        {tab === 'json' && (
          <JsonEditor value={item} onSave={save} readOnlyFields={['id', 'entity_type', 'created_at', 'created_by']} />
        )}
      </div>
    </div>
  );
}
