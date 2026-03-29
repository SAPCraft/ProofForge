import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

export default function PlanList() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/plans').then(setItems);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const item = await api.post('/plans', {
      name: 'New Test Plan',
      phase: 'functional',
    });
    navigate(`/plans/${item.id}`);
  };

  const filtered = items.filter((i) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return i.name?.toLowerCase().includes(q) || i.phase?.toLowerCase().includes(q);
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Test Plans</h2>
        <div className="page-actions">
          <input
            type="text"
            placeholder="Filter..."
            className="input-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            + New Plan
          </button>
        </div>
      </div>
      <div className="entity-table">
        <div className="table-header">
          <span className="col-id">ID</span>
          <span className="col-name">Name</span>
          <span className="col-phase">Phase</span>
          <span className="col-steps">Scenarios</span>
          <span className="col-status">Status</span>
          <span className="col-date">Updated</span>
        </div>
        {filtered.map((item) => (
          <Link to={`/plans/${item.id}`} key={item.id} className="table-row">
            <span className="col-id">#{item.id}</span>
            <span className="col-name">{item.name}</span>
            <span className="col-phase"><span className="tag phase-tag">{item.phase}</span></span>
            <span className="col-steps">{item.scenarios?.length || 0}</span>
            <span className="col-status"><StatusBadge status={item.status} /></span>
            <span className="col-date">{new Date(item.updated_at).toLocaleDateString()}</span>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="table-empty">No plans yet</div>
        )}
      </div>
    </div>
  );
}
