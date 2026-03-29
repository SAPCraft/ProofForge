import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

export default function DefectList() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/defects').then(setItems);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const item = await api.post('/defects', { title: 'New Defect' });
    navigate(`/defects/${item.id}`);
  };

  const filtered = items.filter((i) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      i.title?.toLowerCase().includes(q) ||
      i.status?.toLowerCase().includes(q) ||
      i.severity?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Defects</h2>
        <div className="page-actions">
          <input
            type="text"
            placeholder="Filter..."
            className="input-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            + New Defect
          </button>
        </div>
      </div>
      <div className="entity-table">
        <div className="table-header">
          <span className="col-id">ID</span>
          <span className="col-name">Title</span>
          <span className="col-severity">Severity</span>
          <span className="col-priority">Priority</span>
          <span className="col-status">Status</span>
          <span className="col-link">Run</span>
          <span className="col-date">Created</span>
        </div>
        {filtered.map((item) => (
          <Link to={`/defects/${item.id}`} key={item.id} className="table-row">
            <span className="col-id">#{item.id}</span>
            <span className="col-name">{item.title}</span>
            <span className="col-severity">
              <span className={`severity-badge ${item.severity}`}>{item.severity}</span>
            </span>
            <span className="col-priority">{item.priority}</span>
            <span className="col-status"><StatusBadge status={item.status} /></span>
            <span className="col-link">{item.run_id ? `Run #${item.run_id}` : '—'}</span>
            <span className="col-date">{new Date(item.created_at).toLocaleDateString()}</span>
          </Link>
        ))}
        {filtered.length === 0 && <div className="table-empty">No defects yet</div>}
      </div>
    </div>
  );
}
