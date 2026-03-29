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

      {/* Local Proxy */}
      <LocalProxySection />
    </div>
  );
}

function LocalProxySection() {
  const [status, setStatus] = useState('checking'); // checking, online, offline

  const checkProxy = async () => {
    setStatus('checking');
    try {
      const res = await fetch('http://localhost:8585/health', { signal: AbortSignal.timeout(2000) });
      if (res.ok) { setStatus('online'); return; }
    } catch {}
    setStatus('offline');
  };

  React.useEffect(() => { checkProxy(); const t = setInterval(checkProxy, 10000); return () => clearInterval(t); }, []);

  const downloadProxy = () => {
    const pfHost = window.location.hostname;
    const pfPort = window.location.port || '3000';
    const pfOrigin = `http://${pfHost}:${pfPort}`;
    const cmd = `@echo off
title ProofForge SAP Proxy
chcp 65001 >nul 2>&1

echo.
echo   ProofForge SAP Local Proxy
echo   ================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [!] Node.js is not installed.
    echo   Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do echo   Node.js %%v
echo   Starting on http://localhost:8585
echo   ProofForge backend: ${pfOrigin}
echo   Keep this window open while using ProofForge.
echo.
echo   Open ProofForge at: http://localhost:8585
echo.

node -e "const http=require('http'),https=require('https');const PF='${pfOrigin}';const s=http.createServer((q,r)=>{const ts=()=>new Date().toLocaleTimeString();if(q.url==='/health'){r.writeHead(200,{'Content-Type':'application/json'});r.end(JSON.stringify({status:'ok'}));return}const sapTarget=q.headers['x-sap-target'];if(sapTarget){r.setHeader('Access-Control-Allow-Origin','*');r.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');r.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,Accept,X-SAP-Target');if(q.method==='OPTIONS'){r.writeHead(204);r.end();return}const u=sapTarget+q.url;console.log(ts()+' [SAP] '+q.method+' '+u);const fh={...q.headers};delete fh['x-sap-target'];fh.host=new URL(sapTarget).host;const m=u.startsWith('https')?https:http;const p=m.request(u,{method:q.method,headers:fh,rejectUnauthorized:false},z=>{const h={...z.headers};h['access-control-allow-origin']='*';console.log(ts()+' [SAP] <- '+z.statusCode);r.writeHead(z.statusCode,h);z.pipe(r)});p.on('error',e=>{console.error(ts()+' [SAP] ERR: '+e.message);r.writeHead(502);r.end(JSON.stringify({error:e.message}))});p.setTimeout(30000,()=>p.destroy());q.pipe(p);return}console.log(ts()+' [PF] '+q.method+' '+q.url);const pfUrl=PF+q.url;const pf=http.request(pfUrl,{method:q.method,headers:{...q.headers,host:new URL(PF).host}},z=>{r.writeHead(z.statusCode,z.headers);z.pipe(r)});pf.on('error',e=>{console.error(ts()+' [PF] ERR: '+e.message);r.writeHead(502);r.end('ProofForge backend unavailable')});q.pipe(pf)});s.listen(8585,()=>{console.log('  Ready! Open http://localhost:8585');console.log('')})"

echo.
pause
`;
    const blob = new Blob([cmd], { type: 'application/cmd' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proofforge-proxy.cmd';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#4c6fff' }}>SAP Local Proxy</h3>
      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
        To fetch SAP documents, a small proxy must run on your local machine (where VPN is connected).
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', border: '1px solid #e2e5e9', borderRadius: '6px', background: status === 'online' ? '#f0fdf4' : '#fafbfc' }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: status === 'online' ? '#2e7d32' : status === 'checking' ? '#f59e0b' : '#dc3545',
          boxShadow: status === 'online' ? '0 0 6px #2e7d32' : 'none',
        }} />
        <span style={{ fontSize: '13px', fontWeight: 500 }}>
          {status === 'online' ? 'Proxy is running' : status === 'checking' ? 'Checking...' : 'Proxy is not running'}
        </span>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>localhost:8585</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button className="btn btn-sm btn-ghost" onClick={checkProxy}>Check</button>
          <button className="btn btn-sm btn-primary" onClick={downloadProxy}>
            ⬇ Download Proxy
          </button>
        </div>
      </div>
      {status === 'offline' && (
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', lineHeight: '1.6' }}>
          <strong>How to start:</strong> Download → double-click the .cmd file → keep the window open.
          Requires <a href="https://nodejs.org/" target="_blank" rel="noopener">Node.js</a> on your machine.
        </div>
      )}
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
