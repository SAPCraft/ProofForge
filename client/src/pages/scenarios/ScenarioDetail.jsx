import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import JsonEditor from '../../components/JsonEditor.jsx';

function AutoTextarea({ value, onChange, minRows = 2, ...props }) {
  const ref = useRef(null);
  const adjust = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);
  useEffect(() => { adjust(); }, [value, adjust]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => { onChange(e); adjust(); }}
      rows={minRows}
      style={{ overflow: 'hidden', resize: 'none' }}
      {...props}
    />
  );
}

const STATUSES = ['draft', 'ready', 'archived'];

function paramsToText(params) {
  if (!params) return '';
  if (typeof params === 'string') return params;
  return Object.entries(params).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function textToParams(text) {
  if (!text || !text.trim()) return {};
  const obj = {};
  text.split('\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) obj[key] = val;
    }
  });
  return Object.keys(obj).length > 0 ? obj : text;
}

function ParamsEditor({ value, onSave, minRows = 3 }) {
  const [text, setText] = useState(() => paramsToText(value));
  useEffect(() => { setText(paramsToText(value)); }, [value]);
  return (
    <AutoTextarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(textToParams(text))}
      minRows={minRows}
      placeholder="key: value (one per line)"
    />
  );
}

export default function ScenarioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(null);

  const load = () => api.get(`/scenarios/${id}`).then(setItem);
  useEffect(() => { load(); }, [id]);

  if (!item) return <div className="loading">Loading...</div>;

  const save = async (data) => {
    const updated = await api.put(`/scenarios/${id}`, data);
    setItem(updated);
    setEditing(null);
  };

  const handleCopy = async () => {
    const copy = await api.post(`/scenarios/${id}/copy`, {});
    navigate(`/scenarios/${copy.id}`);
  };

  const handleRun = async () => {
    const run = await api.post('/runs', { scenario_id: item.id });
    navigate(`/runs/${run.id}`);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this scenario?')) return;
    await api.delete(`/scenarios/${id}`);
    navigate('/scenarios');
  };

  const addStep = () => {
    const steps = [...(item.steps || [])];
    const nextOrder = steps.length + 1;
    steps.push({
      id: `step_${nextOrder}`,
      order: nextOrder,
      name: `Step ${nextOrder}`,
      description: '',
      executor_type: 'human',
      executor_role: '',
      action_type: 'transaction',
      parameters: {},
      preconditions: '',
      expected_result: '',
      validation_templates: [],
      mandatory: true,
      continue_on_error: false,
    });
    save({ ...item, steps });
  };

  const removeStep = (stepId) => {
    const steps = item.steps.filter((s) => s.id !== stepId);
    steps.forEach((s, i) => { s.order = i + 1; });
    save({ ...item, steps });
  };

  const updateStep = (stepId, field, value) => {
    const steps = item.steps.map((s) =>
      s.id === stepId ? { ...s, [field]: value } : s
    );
    save({ ...item, steps });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate('/scenarios')}>Scenarios</a>
          <span>/</span>
          <span>#{item.id}</span>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={handleCopy}>Copy</button>
          <button className="btn btn-primary" onClick={handleRun}>Run</button>
          <button className="btn btn-danger-ghost" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          {editing === 'name' ? (
            <input
              className="inline-edit"
              defaultValue={item.name}
              autoFocus
              onBlur={(e) => save({ ...item, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            />
          ) : (
            <h2 className="card-title" onClick={() => setEditing('name')}>
              {item.code && <span className="item-code">{item.code} </span>}
              {item.name}
            </h2>
          )}
          <div className="card-meta">
            <select
              value={item.status}
              onChange={(e) => save({ ...item, status: e.target.value })}
              className="status-select"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="meta-item">Priority: {item.priority}</span>
            {item.parent_id && <span className="meta-item">Copied from #{item.parent_id}</span>}
          </div>
        </div>

        <div className="tabs">
          <button className={tab === 'details' ? 'tab active' : 'tab'} onClick={() => setTab('details')}>Steps</button>
          <button className={tab === 'info' ? 'tab active' : 'tab'} onClick={() => setTab('info')}>Info</button>
          <button className={tab === 'json' ? 'tab active' : 'tab'} onClick={() => setTab('json')}>JSON</button>
        </div>

        {tab === 'details' && (
          <div className="steps-section">
            <div className="steps-list">
              {(item.steps || []).map((step) => (
                <div key={step.id} className="step-card">
                  <div className="step-header">
                    <span className="step-order">{step.order}</span>
                    <input
                      className="step-name-input"
                      value={step.name}
                      onChange={(e) => updateStep(step.id, 'name', e.target.value)}
                    />
                    <span className={`executor-badge ${step.executor_type}`}>
                      {step.executor_type}
                    </span>
                    <select
                      value={step.action_type}
                      onChange={(e) => updateStep(step.id, 'action_type', e.target.value)}
                      className="action-select"
                    >
                      {['transaction', 'document', 'report', 'other'].map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <button className="btn-icon" onClick={() => removeStep(step.id)} title="Remove step">×</button>
                  </div>
                  <div className="step-body">
                    <div className="step-field-row">
                      <div className="step-field" style={{ flex: 1 }}>
                        <label>Description</label>
                        <AutoTextarea
                          value={step.description}
                          onChange={(e) => updateStep(step.id, 'description', e.target.value)}
                          minRows={3}
                        />
                      </div>
                      <div className="step-field" style={{ flex: 1 }}>
                        <label>Input Parameters</label>
                        <ParamsEditor
                          value={step.parameters}
                          onSave={(parsed) => updateStep(step.id, 'parameters', parsed)}
                        />
                      </div>
                    </div>
                    <div className="step-field-row">
                      <div className="step-field">
                        <label>Preconditions</label>
                        <AutoTextarea
                          value={step.preconditions}
                          onChange={(e) => updateStep(step.id, 'preconditions', e.target.value)}
                          minRows={1}
                        />
                      </div>
                      <div className="step-field">
                        <label>Expected Result</label>
                        <AutoTextarea
                          value={step.expected_result}
                          onChange={(e) => updateStep(step.id, 'expected_result', e.target.value)}
                          minRows={1}
                        />
                      </div>
                    </div>
                    <div className="step-field">
                      <label>Fiori App / Transaction</label>
                      <input
                        value={step.fiori_app || ''}
                        onChange={(e) => updateStep(step.id, 'fiori_app', e.target.value)}
                        placeholder="e.g. CashJournal-enterCashJournalEntry?sap-ui-tech-hint=GUI"
                        style={{ fontSize: '11px', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div className="step-flags">
                      <label>
                        <input
                          type="checkbox"
                          checked={step.mandatory !== false}
                          onChange={(e) => updateStep(step.id, 'mandatory', e.target.checked)}
                        /> Mandatory
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!step.continue_on_error}
                          onChange={(e) => updateStep(step.id, 'continue_on_error', e.target.checked)}
                        /> Continue on error
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-full" onClick={addStep}>
              + Add Step
            </button>
          </div>
        )}

        {tab === 'info' && (
          <div className="info-section">
            <div className="form-group">
              <label>Code</label>
              <input value={item.code || ''} onChange={(e) => save({ ...item, code: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Business Goal</label>
              <AutoTextarea value={item.business_goal || ''} onChange={(e) => save({ ...item, business_goal: e.target.value })} minRows={2} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <AutoTextarea value={item.description || ''} onChange={(e) => save({ ...item, description: e.target.value })} minRows={2} />
            </div>
            <div className="form-group">
              <label>Expected Business Result</label>
              <AutoTextarea value={item.expected_result || ''} onChange={(e) => save({ ...item, expected_result: e.target.value })} minRows={2} />
            </div>
            <div className="form-group">
              <label>Tags (comma separated)</label>
              <input
                value={(item.tags || []).join(', ')}
                onChange={(e) => save({ ...item, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              />
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select value={item.priority || 'medium'} onChange={(e) => save({ ...item, priority: e.target.value })}>
                {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        )}

        {tab === 'json' && (
          <JsonEditor
            value={item}
            onSave={save}
            readOnlyFields={['id', 'entity_type', 'created_at', 'created_by']}
          />
        )}
      </div>

      <div className="card-footer-meta">
        Created {new Date(item.created_at).toLocaleString()} · Updated {new Date(item.updated_at).toLocaleString()}
      </div>
    </div>
  );
}
