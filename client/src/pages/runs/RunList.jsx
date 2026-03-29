import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

export default function RunList() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');

  const load = () => api.get('/runs').then(setItems);
  useEffect(() => { load(); }, []);

  const filtered = items.filter((i) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      i.scenario_snapshot?.name?.toLowerCase().includes(q) ||
      i.status?.toLowerCase().includes(q) ||
      String(i.id).includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Runs</h2>
        <div className="page-actions">
          <input
            type="text"
            placeholder="Filter..."
            className="input-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>
      <div className="entity-table">
        <div className="table-header">
          <span className="col-id">ID</span>
          <span className="col-name">Scenario</span>
          <span className="col-steps">Progress</span>
          <span className="col-status">Status</span>
          <span className="col-result">Result</span>
          <span className="col-date">Started</span>
        </div>
        {filtered.map((item) => {
          const total = item.step_executions?.length || 0;
          const done = item.step_executions?.filter((s) =>
            !['not_started', 'in_progress'].includes(s.current_status)
          ).length || 0;
          return (
            <Link to={`/runs/${item.id}`} key={item.id} className="table-row">
              <span className="col-id">#{item.id}</span>
              <span className="col-name">{item.scenario_snapshot?.name || `Scenario #${item.scenario_id}`}</span>
              <span className="col-steps">
                <span className="progress-mini">
                  <span className="progress-mini-bar" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
                </span>
                {done}/{total}
              </span>
              <span className="col-status"><StatusBadge status={item.status} /></span>
              <span className="col-result">{item.result && <StatusBadge status={item.result} />}</span>
              <span className="col-date">{item.started_at ? new Date(item.started_at).toLocaleDateString() : '—'}</span>
            </Link>
          );
        })}
        {filtered.length === 0 && <div className="table-empty">No runs yet. Start a run from a Scenario.</div>}
      </div>
    </div>
  );
}
