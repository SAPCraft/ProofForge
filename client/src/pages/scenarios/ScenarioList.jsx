import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

export default function ScenarioList() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/scenarios').then(setItems);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const item = await api.post('/scenarios', {
      name: 'New Scenario',
      code: '',
      steps: [
        {
          id: 'step_1',
          order: 1,
          name: 'Step 1',
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
        },
      ],
    });
    navigate(`/scenarios/${item.id}`);
  };

  const filtered = items.filter((i) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      i.name?.toLowerCase().includes(q) ||
      i.code?.toLowerCase().includes(q) ||
      i.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page">
      <div className="page-header">
        <h2>Scenarios</h2>
        <div className="page-actions">
          <input
            type="text"
            placeholder="Filter..."
            className="input-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            + New Scenario
          </button>
        </div>
      </div>
      <div className="entity-table">
        <div className="table-header">
          <span className="col-id">ID</span>
          <span className="col-name">Name</span>
          <span className="col-tags">Tags</span>
          <span className="col-steps">Steps</span>
          <span className="col-status">Status</span>
          <span className="col-date">Updated</span>
        </div>
        {filtered.map((item) => (
          <Link to={`/scenarios/${item.id}`} key={item.id} className="table-row">
            <span className="col-id">#{item.id}</span>
            <span className="col-name">
              {item.code && <span className="item-code">{item.code}</span>}
              {item.name}
            </span>
            <span className="col-tags">
              {item.tags?.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </span>
            <span className="col-steps">{item.steps?.length || 0} steps</span>
            <span className="col-status"><StatusBadge status={item.status} /></span>
            <span className="col-date">{new Date(item.updated_at).toLocaleDateString()}</span>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="table-empty">No scenarios yet</div>
        )}
      </div>
    </div>
  );
}
