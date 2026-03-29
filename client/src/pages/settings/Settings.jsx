import React, { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

export default function Settings() {
  const [systems, setSystems] = useState([]);
  const [editing, setEditing] = useState(null); // system id or 'new'

  const load = () => api.get('/systems').then(setSystems);
  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editing === 'new') {
      await api.post('/systems', data);
    } else {
      await api.put(`/systems/${editing}`, data);
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this system?')) return;
    await api.delete(`/systems/${id}`);
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#4c6fff' }}>SAP Systems</h3>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
          Configure SAP systems here. Select a system when creating a Run to enable deep links and document fetch.
        </p>

        {systems.map((sys) => (
          <div key={sys.id} style={{ border: '1px solid #e2e5e9', borderRadius: '6px', marginBottom: '8px', overflow: 'hidden' }}>
            {editing === sys.id ? (
              <SystemForm system={sys} onSave={handleSave} onCancel={() => setEditing(null)} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{sys.name || 'Unnamed'}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace', marginTop: '2px' }}>
                    {sys.base_url} · Client {sys.client} · {sys.language}
                    {sys.user && <span> · User: {sys.user}</span>}
                    {sys.description && <span> · {sys.description}</span>}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(sys.id)}>Edit</button>
                <button className="btn btn-sm btn-danger-ghost" onClick={() => handleDelete(sys.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}

        {editing === 'new' ? (
          <div style={{ border: '1px solid #4c6fff', borderRadius: '6px', overflow: 'hidden' }}>
            <SystemForm system={{}} onSave={handleSave} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={() => setEditing('new')}>
            + Add SAP System
          </button>
        )}
      </div>
    </div>
  );
}

function SystemForm({ system, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: system.name || '',
    description: system.description || '',
    base_url: system.base_url || '',
    client: system.client || '220',
    language: system.language || 'EN',
    user: system.user || '',
    password: system.password === '••••••' ? '' : (system.password || ''),
  });

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    // Don't send empty password (keeps existing)
    if (!data.password && system.id) data.password = '••••••';
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px', background: '#fafbfc' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>System Name</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. DEV 220" required />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Description</label>
          <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Development system" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 80px 60px', gap: '10px', marginBottom: '10px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Base URL</label>
          <input value={form.base_url} onChange={(e) => set('base_url', e.target.value)} placeholder="https://host:port" required style={{ fontFamily: 'monospace', fontSize: '11px' }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Client</label>
          <input value={form.client} onChange={(e) => set('client', e.target.value)} placeholder="220" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Lang</label>
          <input value={form.language} onChange={(e) => set('language', e.target.value)} placeholder="EN" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>SAP User</label>
          <input value={form.user} onChange={(e) => set('user', e.target.value)} placeholder="SAP username" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>SAP Password</label>
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={system.id ? '(unchanged)' : 'password'} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="submit" className="btn btn-primary btn-sm">Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
