import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import JsonEditor from '../../components/JsonEditor.jsx';

const STATUSES = ['open', 'in_progress', 'fixed', 'ready_for_retest', 'closed', 'rejected'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export default function DefectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [tab, setTab] = useState('details');

  const load = () => api.get(`/defects/${id}`).then(setItem);
  useEffect(() => { load(); }, [id]);

  if (!item) return <div className="loading">Loading...</div>;

  const save = async (data) => {
    const updated = await api.put(`/defects/${id}`, data);
    setItem(updated);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this defect?')) return;
    await api.delete(`/defects/${id}`);
    navigate('/defects');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate('/defects')}>Defects</a>
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
            value={item.title}
            onChange={(e) => save({ ...item, title: e.target.value })}
          />
          <div className="card-meta">
            <select value={item.status} onChange={(e) => save({ ...item, status: e.target.value })} className="status-select">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={item.severity} onChange={(e) => save({ ...item, severity: e.target.value })} className="severity-select">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={item.priority} onChange={(e) => save({ ...item, priority: e.target.value })} className="priority-select">
              {PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Traceability links */}
        <div className="trace-links">
          {item.run_id && <Link to={`/runs/${item.run_id}`} className="trace-link">Run #{item.run_id}</Link>}
          {item.scenario_id && <Link to={`/scenarios/${item.scenario_id}`} className="trace-link">Scenario #{item.scenario_id}</Link>}
          {item.step_id && <span className="trace-link">Step: {item.step_id}</span>}
        </div>

        <div className="tabs">
          <button className={tab === 'details' ? 'tab active' : 'tab'} onClick={() => setTab('details')}>Details</button>
          <button className={tab === 'json' ? 'tab active' : 'tab'} onClick={() => setTab('json')}>JSON</button>
        </div>

        {tab === 'details' && (
          <div className="info-section">
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={item.description || ''}
                onChange={(e) => save({ ...item, description: e.target.value })}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label>Reproduction Steps</label>
              <textarea
                value={item.reproduction_steps || ''}
                onChange={(e) => save({ ...item, reproduction_steps: e.target.value })}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label>Assignee</label>
              <input value={item.assignee || ''} onChange={(e) => save({ ...item, assignee: e.target.value })} />
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

      <div className="card-footer-meta">
        Created {new Date(item.created_at).toLocaleString()} · Updated {new Date(item.updated_at).toLocaleString()}
      </div>
    </div>
  );
}
