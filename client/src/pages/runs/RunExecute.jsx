import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

const STEP_STATUSES = ['not_started', 'in_progress', 'passed', 'passed_with_comments', 'failed', 'blocked', 'skipped'];
const VAL_STATUSES = ['pending', 'passed', 'failed', 'waived'];
const RUN_STATUSES = ['planned', 'in_progress', 'completed', 'blocked', 'cancelled'];

export default function RunExecute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [activeStep, setActiveStep] = useState(null);
  const [comment, setComment] = useState('');
  const [valName, setValName] = useState('');
  const [defects, setDefects] = useState([]);
  const [sapDocType, setSapDocType] = useState('Cash Document');
  const [sapDocNum, setSapDocNum] = useState('');
  const [pastedImages, setPastedImages] = useState([]);
  const [sapDocs, setSapDocs] = useState({});
  const [sapSystems, setSapSystems] = useState([]);
  const fileRef = useRef(null);

  const load = async () => {
    const r = await api.get(`/runs/${id}`);
    setRun(r);
    if (!activeStep && r.step_executions?.length > 0) {
      const firstPending = r.step_executions.find((s) => s.current_status === 'not_started' || s.current_status === 'in_progress');
      setActiveStep(firstPending?.step_id || r.step_executions[0].step_id);
    }
    // Load saved SAP payloads into display state
    const saved = {};
    for (const se of (r.step_executions || [])) {
      for (const att of (se.attempts || [])) {
        if (att.sap_payloads) {
          for (const [key, payload] of Object.entries(att.sap_payloads)) {
            saved[key] = payload;
          }
        }
      }
    }
    if (Object.keys(saved).length > 0) setSapDocs((prev) => ({ ...prev, ...saved }));
    const d = await api.get(`/defects?run_id=${id}`);
    setDefects(d);
  };
  useEffect(() => { load(); api.get('/systems').then(setSapSystems); }, [id]);

  if (!run) return <div className="loading">Loading...</div>;

  const snapshot = run.scenario_snapshot;
  const steps = snapshot?.steps || [];

  const getStepDef = (stepId) => steps.find((s) => s.id === stepId) || {};
  const getStepExec = (stepId) => run.step_executions?.find((s) => s.step_id === stepId);
  const getLatestAttempt = (stepExec) => stepExec?.attempts?.[stepExec.attempts.length - 1];

  const handleExecute = async (stepId, status) => {
    await api.post(`/runs/${id}/steps/${stepId}/execute`, { status, comment });
    setComment('');
    load();
  };

  const fetchSapDocument = async (objectType, objectId) => {
    const key = `${objectType}_${objectId}`;
    setSapDocs((prev) => ({ ...prev, [key]: { loading: true } }));
    const sys = run.sap_system;
    if (!sys?.base_url || !sys?.user || !sys?.password) {
      setSapDocs((prev) => ({ ...prev, [key]: { error: 'SAP credentials not configured. Go to Settings → SAP Systems.' } }));
      return;
    }

    const isLocalProxy = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const client = sys.client || '000';
    const odataPath = `/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/A_OperationalAcctgDocItemCube?$filter=AccountingDocument eq '${objectId}'&sap-client=${client}&$format=json&$top=50`;
    const auth = btoa(`${sys.user}:${sys.password}`);

    if (isLocalProxy) {
      // On local proxy: send SAP request directly through same origin
      console.log('[ProofForge] Local proxy mode — fetching SAP via same origin');
      console.log('[ProofForge] SAP target:', sys.base_url, 'Path:', odataPath);
      try {
        const res = await fetch(odataPath, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'X-SAP-Target': sys.base_url,
          },
        });
        console.log('[ProofForge] SAP response:', res.status);
        if (!res.ok) {
          const errText = await res.text();
          console.log('[ProofForge] SAP error:', errText.slice(0, 500));
          throw new Error(`SAP ${res.status}: ${errText.slice(0, 200)}`);
        }
        const data = await res.json();
        console.log('[ProofForge] SAP items:', data?.d?.results?.length || 0);
        const items = data?.d?.results || [];
        const result = { items, fetched_at: new Date().toISOString() };
        setSapDocs((prev) => ({ ...prev, [key]: result }));
        await saveSapPayload(objectType, objectId, result);
      } catch (err) {
        console.error('[ProofForge] SAP fetch error:', err.message);
        setSapDocs((prev) => ({ ...prev, [key]: { error: err.message } }));
      }
    } else {
      // On VPS: try server-side fetch
      console.log('[ProofForge] Remote mode — trying server-side SAP fetch');
      try {
        const res = await fetch('/api/sap/fetch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('pf_token')}`,
          },
          body: JSON.stringify({ sap_system: sys, object_type: objectType, object_id: objectId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const result = { items: data.items, fiori_link: data.fiori_link, fetched_at: data.fetched_at };
        setSapDocs((prev) => ({ ...prev, [key]: result }));
        await saveSapPayload(objectType, objectId, result);
      } catch (err) {
        console.error('[ProofForge] Server fetch failed:', err.message);
        setSapDocs((prev) => ({ ...prev, [key]: { error: `${err.message}. Open ProofForge via http://localhost:8585 with local proxy running.` } }));
      }
    }
  };

  // Save fetched SAP data permanently to the attempt
  const saveSapPayload = async (objectType, objectId, fetchedData) => {
    const stepExec = getStepExec(activeStep);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const payloads = { ...(attempt.sap_payloads || {}) };
    payloads[`${objectType}_${objectId}`] = {
      object_type: objectType,
      object_id: objectId,
      items: fetchedData.items,
      fiori_link: fetchedData.fiori_link,
      fetched_at: fetchedData.fetched_at,
    };
    await handleUpdateAttempt(activeStep, attempt.attempt_number, { sap_payloads: payloads });
  };

  const buildSapDocLink = (objectType, objectId) => {
    const sys = run.sap_system;
    if (!sys?.base_url) return null;
    const client = sys.client || '000';
    const lang = sys.language || 'EN';
    if (objectType === 'FI Document') {
      return `${sys.base_url}/sap/bc/ui2/flp?sap-client=${client}&sap-language=${lang}#FinancialAccounting-displayJournalEntry?AccountingDocument=${objectId}`;
    }
    return null;
  };

  // Key fields to show for FI document line items
  const FI_DISPLAY_FIELDS = [
    { key: 'CompanyCode', label: 'CoCd' },
    { key: 'AccountingDocumentItem', label: 'Item' },
    { key: 'GLAccount', label: 'G/L Account' },
    { key: 'GLAccountName', label: 'Account Name' },
    { key: 'DebitAmountInTransCrcy', label: 'Debit' },
    { key: 'CreditAmountInTransCrcy', label: 'Credit' },
    { key: 'TransactionCurrency', label: 'Currency' },
    { key: 'Customer', label: 'Customer' },
    { key: 'Supplier', label: 'Supplier' },
    { key: 'ProfitCenter', label: 'Profit Center' },
    { key: 'PostingDate', label: 'Posting Date' },
    { key: 'DocumentDate', label: 'Doc Date' },
    { key: 'AccountingDocumentType', label: 'Doc Type' },
  ];

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const url = URL.createObjectURL(file);
          setPastedImages((prev) => [...prev, { file, url }]);
        }
        break;
      }
    }
  };

  const handleUploadPasted = async (stepId) => {
    const stepExec = getStepExec(stepId);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const allAttachments = [...(attempt.attachments || [])];
    for (const img of pastedImages) {
      const meta = await api.upload(`/attachments/${id}/${stepId}/${attempt.attempt_number}`, img.file, `screenshot_${Date.now()}.png`);
      allAttachments.push(meta);
    }
    await handleUpdateAttempt(stepId, attempt.attempt_number, { attachments: allAttachments });
    setPastedImages([]);
  };

  const removePastedImage = (index) => {
    setPastedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteAttempt = async (stepId, attemptNum) => {
    if (!confirm(`Delete attempt #${attemptNum}?`)) return;
    const stepExec = getStepExec(stepId);
    const remaining = stepExec.attempts.filter((a) => a.attempt_number !== attemptNum);
    const updatedStepExecs = run.step_executions.map((se) => {
      if (se.step_id !== stepId) return se;
      return {
        ...se,
        attempts: remaining,
        current_status: remaining.length > 0 ? remaining[remaining.length - 1].status : 'not_started',
      };
    });
    await api.put(`/runs/${id}`, { step_executions: updatedStepExecs });
    load();
  };

  const handleAddSapObject = async (stepId) => {
    if (!sapDocNum.trim()) return;
    const stepExec = getStepExec(stepId);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const existing = attempt.sap_objects || [];
    const newObj = {
      source_system: 'SAP',
      object_type: sapDocType,
      object_id: sapDocNum.trim(),
      captured_at: new Date().toISOString(),
    };
    await handleUpdateAttempt(stepId, attempt.attempt_number, { sap_objects: [...existing, newObj] });
    setSapDocNum('');
  };

  const handleUpdateAttempt = async (stepId, attemptNum, data) => {
    await api.put(`/runs/${id}/steps/${stepId}/attempts/${attemptNum}`, data);
    load();
  };

  const handleAddValidation = async (stepId, attemptNum) => {
    if (!valName.trim()) return;
    await api.post(`/runs/${id}/steps/${stepId}/attempts/${attemptNum}/validations`, {
      name: valName,
    });
    setValName('');
    load();
  };

  const handleUpdateValidation = async (stepId, attemptNum, valId, data) => {
    await api.put(`/runs/${id}/steps/${stepId}/attempts/${attemptNum}/validations/${valId}`, data);
    load();
  };

  const handleUpload = async (stepId) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const stepExec = getStepExec(stepId);
    const attempt = getLatestAttempt(stepExec);
    if (!attempt) return;
    const meta = await api.upload(`/attachments/${id}/${stepId}/${attempt.attempt_number}`, file);
    if (attempt) {
      const attachments = [...(attempt.attachments || []), meta];
      await handleUpdateAttempt(stepId, attempt.attempt_number, { attachments });
    }
    fileRef.current.value = '';
    load();
  };

  const handleCreateDefect = async (stepId) => {
    const stepDef = getStepDef(stepId);
    const defect = await api.post('/defects', {
      title: `Defect in step: ${stepDef.name}`,
      run_id: run.id,
      scenario_id: run.scenario_id,
      plan_id: run.plan_id,
      step_id: stepId,
      source_type: 'Step Execution',
    });
    navigate(`/defects/${defect.id}`);
  };

  const handleRunStatus = async (status) => {
    await api.put(`/runs/${id}`, { status });
    load();
  };

  const handleUpdateSapSystem = async (field, value) => {
    const sapSystem = { ...(run.sap_system || {}), [field]: value };
    await api.put(`/runs/${id}`, { sap_system: sapSystem });
    load();
  };

  const buildSapUrl = (fioriApp) => {
    const sys = run.sap_system;
    if (!sys?.base_url || !fioriApp) return null;
    const client = sys.client || '000';
    const lang = sys.language || 'EN';
    return `${sys.base_url}/sap/bc/ui2/flp?sap-client=${client}&sap-language=${lang}#${fioriApp}`;
  };

  const buildFlpHomeUrl = () => {
    const sys = run.sap_system;
    if (!sys?.base_url) return null;
    const client = sys.client || '000';
    const lang = sys.language || 'EN';
    return `${sys.base_url}/sap/bc/ui2/flp?sap-client=${client}&sap-language=${lang}#Shell-home`;
  };

  const activeStepDef = getStepDef(activeStep);
  const activeStepExec = getStepExec(activeStep);
  const activeAttempt = getLatestAttempt(activeStepExec);

  return (
    <div className="page run-page">
      <div className="page-header">
        <div className="breadcrumb">
          <a onClick={() => navigate('/runs')}>Runs</a>
          <span>/</span>
          <span>#{run.id}</span>
          <span className="breadcrumb-sep">—</span>
          <span>{snapshot?.name}</span>
        </div>
        <div className="page-actions">
          <StatusBadge status={run.status} />
          <select
            value={run.status}
            onChange={(e) => handleRunStatus(e.target.value)}
            className="status-select"
          >
            {RUN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {run.result && <span className="result-tag">Result: <StatusBadge status={run.result} /></span>}
        </div>
      </div>

      {/* SAP System Selector */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 16px', background: '#f0f4ff', border: '1px solid #d0d9f0', borderRadius: '6px', marginBottom: '12px', fontSize: '12px' }}>
        <span style={{ fontWeight: 600, color: '#4c6fff', whiteSpace: 'nowrap' }}>SAP System:</span>
        <select
          value={run.sap_system?.system_id || ''}
          onChange={async (e) => {
            const sysId = Number(e.target.value);
            if (!sysId) { await api.put(`/runs/${id}`, { sap_system: null }); load(); return; }
            const full = await api.get(`/systems/${sysId}/credentials`);
            await api.put(`/runs/${id}`, { sap_system: { system_id: sysId, ...full } });
            load();
          }}
          style={{ width: '250px', fontSize: '12px' }}
        >
          <option value="">— Select system —</option>
          {sapSystems.map((s) => (
            <option key={s.id} value={s.id}>{s.name} (Client {s.client})</option>
          ))}
        </select>
        {run.sap_system?.base_url && (
          <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }}>
            {run.sap_system.base_url} · Client {run.sap_system.client}
          </span>
        )}
        {buildFlpHomeUrl() && (
          <a href={buildFlpHomeUrl()} target="_blank" rel="noopener" className="btn btn-sm btn-primary" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
            Open Fiori Launchpad
          </a>
        )}
      </div>

      <div className="run-layout">
        {/* Step list sidebar */}
        <div className="run-steps-panel">
          <h3>Steps</h3>
          {run.step_executions?.map((se) => {
            const def = getStepDef(se.step_id);
            return (
              <div
                key={se.step_id}
                className={`run-step-item ${activeStep === se.step_id ? 'active' : ''}`}
                onClick={() => setActiveStep(se.step_id)}
              >
                <span className="step-order">{def.order}</span>
                <span className="step-name-text">{def.name}</span>
                <StatusBadge status={se.current_status} />
              </div>
            );
          })}
        </div>

        {/* Step detail panel */}
        <div className="run-step-detail">
          {activeStepDef && (
            <>
              <div className="step-detail-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h3 style={{ margin: 0 }}>Step {activeStepDef.order}: {activeStepDef.name}</h3>
                  {buildSapUrl(activeStepDef.fiori_app) && (
                    <a
                      href={buildSapUrl(activeStepDef.fiori_app)}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-sm btn-primary"
                      style={{ textDecoration: 'none', fontSize: '11px' }}
                    >
                      ▶ Open in SAP
                    </a>
                  )}
                </div>
                <div className="step-detail-meta">
                  <span className={`executor-badge ${activeStepDef.executor_type}`}>{activeStepDef.executor_type}</span>
                  <span className="action-tag">{activeStepDef.action_type}</span>
                  {activeStepDef.mandatory !== false && <span className="mandatory-tag">Mandatory</span>}
                  {activeStepDef.fiori_app && <span className="action-tag" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{activeStepDef.fiori_app}</span>}
                </div>
              </div>

              <div className="step-info-row" style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  {activeStepDef.description && (
                    <div className="step-info-block">
                      <label>Description</label>
                      <p style={{ whiteSpace: 'pre-line' }}>{activeStepDef.description}</p>
                    </div>
                  )}
                </div>
                {activeStepDef.parameters && Object.keys(activeStepDef.parameters).length > 0 && (
                  <div style={{ flex: 1 }}>
                    <div className="step-info-block">
                      <label>Input Parameters</label>
                      <div style={{ background: '#fafbfc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #eef0f3', fontSize: '12px' }}>
                        {typeof activeStepDef.parameters === 'string'
                          ? <p style={{ whiteSpace: 'pre-line' }}>{activeStepDef.parameters}</p>
                          : Object.entries(activeStepDef.parameters).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                              <span style={{ fontWeight: 600, color: '#6b7280', minWidth: '140px' }}>{k}:</span>
                              <span>{v}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {activeStepDef.preconditions && (
                <div className="step-info-block">
                  <label>Preconditions</label>
                  <p>{activeStepDef.preconditions}</p>
                </div>
              )}
              {activeStepDef.expected_result && (
                <div className="step-info-block">
                  <label>Expected Result</label>
                  <p>{activeStepDef.expected_result}</p>
                </div>
              )}

              {/* Execution controls */}
              <div className="execution-section">
                <h4>Execution</h4>
                {activeStepExec?.attempts?.length > 0 && (
                  <div className="attempts-list">
                    {activeStepExec.attempts.map((att) => (
                      <div key={att.attempt_number} className="attempt-card">
                        <div className="attempt-header">
                          <span>Attempt #{att.attempt_number}</span>
                          <StatusBadge status={att.status} />
                          <span className="attempt-time">
                            {att.started_at && new Date(att.started_at).toLocaleString()}
                          </span>
                          <button
                            className="btn-icon"
                            onClick={() => handleDeleteAttempt(activeStep, att.attempt_number)}
                            title="Delete attempt"
                            style={{ marginLeft: 'auto', fontSize: '14px' }}
                          >×</button>
                        </div>
                        {att.comment && <p className="attempt-comment">{att.comment}</p>}

                        {/* SAP Objects */}
                        {att.sap_objects?.length > 0 && (
                          <div className="sap-objects">
                            <label>SAP Documents</label>
                            {att.sap_objects.map((obj, i) => {
                              const docKey = `${obj.object_type}_${obj.object_id}`;
                              const docData = sapDocs[docKey];
                              const docLink = buildSapDocLink(obj.object_type, obj.object_id);
                              return (
                                <div key={i} style={{ border: '1px solid #e2e5e9', borderRadius: '6px', marginBottom: '8px', overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#fafbfc' }}>
                                    <span className="sap-type">{obj.object_type}</span>
                                    <span className="sap-id" style={{ fontWeight: 600 }}>{obj.object_id}</span>
                                    {docLink && (
                                      <a href={docLink} target="_blank" rel="noopener" style={{ fontSize: '11px', color: '#4c6fff', textDecoration: 'none' }}>
                                        Open in SAP ↗
                                      </a>
                                    )}
                                    <button
                                      className="btn btn-sm"
                                      style={{ marginLeft: 'auto', fontSize: '10px' }}
                                      onClick={() => fetchSapDocument(obj.object_type, obj.object_id)}
                                      disabled={docData?.loading}
                                    >
                                      {docData?.loading ? 'Loading...' : docData?.items ? '↻ Refresh' : '⬇ Fetch from SAP'}
                                    </button>
                                    <button
                                      className="btn-icon"
                                      style={{ fontSize: '12px', padding: '0 4px' }}
                                      title="Remove"
                                      onClick={() => {
                                        const updated = att.sap_objects.filter((_, idx) => idx !== i);
                                        handleUpdateAttempt(activeStep, att.attempt_number, { sap_objects: updated });
                                      }}
                                    >×</button>
                                  </div>
                                  {docData?.error && (
                                    <div style={{ padding: '8px 10px', color: '#c62828', fontSize: '11px', background: '#fce4ec' }}>
                                      {docData.error}
                                    </div>
                                  )}
                                  {docData?.items && (
                                    <div style={{ padding: '0', overflow: 'auto', maxHeight: '300px' }}>
                                      {docData.items.length === 0 ? (
                                        <div style={{ padding: '10px', color: '#6b7280', fontSize: '12px' }}>No data returned from SAP</div>
                                      ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                          <thead>
                                            <tr style={{ background: '#f0f2f5', position: 'sticky', top: 0 }}>
                                              {FI_DISPLAY_FIELDS.filter((f) => docData.items.some((item) => item[f.key])).map((f) => (
                                                <th key={f.key} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#4a5568', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e5e9' }}>{f.label}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {docData.items.map((item, idx) => (
                                              <tr key={idx} style={{ borderBottom: '1px solid #eef0f3' }}>
                                                {FI_DISPLAY_FIELDS.filter((f) => docData.items.some((it) => it[f.key])).map((f) => (
                                                  <td key={f.key} style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                                                    {f.key.includes('Amount') && item[f.key] ? Number(item[f.key]).toLocaleString() : item[f.key] || ''}
                                                  </td>
                                                ))}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                      <div style={{ padding: '4px 10px', fontSize: '10px', color: '#9ca3af', borderTop: '1px solid #eef0f3' }}>
                                        Fetched {new Date(docData.fetched_at).toLocaleString()} · {docData.items.length} line items
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Attachments */}
                        {att.attachments?.length > 0 && (
                          <div className="attachments">
                            <label>Attachments</label>
                            {att.attachments.map((a, i) => (
                              <a key={i} href={`/api/attachments/${a.storage_path}`} target="_blank" className="attachment-link">
                                {a.filename}
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Validations */}
                        {att.validations?.length > 0 && (
                          <div className="validations-section">
                            <label>Validations</label>
                            {att.validations.map((v) => (
                              <div key={v.id} className="validation-card">
                                <span className="val-name">{v.name}</span>
                                <select
                                  value={v.status}
                                  onChange={(e) => handleUpdateValidation(activeStep, att.attempt_number, v.id, { status: e.target.value })}
                                  className="val-status-select"
                                >
                                  {VAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <input
                                  placeholder="Comment..."
                                  defaultValue={v.comment}
                                  onBlur={(e) => handleUpdateValidation(activeStep, att.attempt_number, v.id, { comment: e.target.value })}
                                  className="val-comment"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add validation */}
                        {att === activeAttempt && (
                          <div className="add-validation-row">
                            <input
                              placeholder="Validation name..."
                              value={valName}
                              onChange={(e) => setValName(e.target.value)}
                            />
                            <button className="btn btn-sm btn-ghost" onClick={() => handleAddValidation(activeStep, att.attempt_number)}>
                              + Validation
                            </button>
                          </div>
                        )}

                        {/* Update status of current attempt */}
                        {att === activeAttempt && att.status === 'in_progress' && (
                          <div className="step-status-actions">
                            {['passed', 'passed_with_comments', 'failed', 'blocked', 'skipped'].map((s) => (
                              <button
                                key={s}
                                className={`btn btn-sm status-btn status-${s}`}
                                onClick={() => handleUpdateAttempt(activeStep, att.attempt_number, { status: s, comment })}
                              >
                                {s.replace(/_/g, ' ')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Start / Re-execute */}
                {(!activeAttempt || ['passed', 'passed_with_comments', 'failed', 'blocked', 'skipped'].includes(activeAttempt?.status)) && (
                  <div className="execute-controls">
                    <div
                      style={{ border: '2px dashed #d0d9f0', borderRadius: '6px', padding: '10px', marginBottom: '8px', background: pastedImages.length > 0 ? '#f8faff' : 'transparent' }}
                    >
                      <textarea
                        placeholder="Comment + paste screenshot (Ctrl+V)..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onPaste={handlePaste}
                        rows={2}
                        className="comment-input"
                        style={{ marginBottom: pastedImages.length > 0 ? '8px' : 0 }}
                      />
                      {pastedImages.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {pastedImages.map((img, i) => (
                            <div key={i} style={{ position: 'relative', border: '1px solid #e2e5e9', borderRadius: '4px', overflow: 'hidden' }}>
                              <img src={img.url} alt={`paste-${i}`} style={{ maxWidth: '200px', maxHeight: '120px', display: 'block' }} />
                              <button
                                onClick={() => removePastedImage(i)}
                                style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '11px', cursor: 'pointer', lineHeight: '16px', textAlign: 'center' }}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="execute-buttons">
                      <button className="btn btn-primary" onClick={async () => {
                        await handleExecute(activeStep, 'in_progress');
                        if (pastedImages.length > 0) { await handleUploadPasted(activeStep); }
                      }}>
                        {activeAttempt ? 'Re-execute' : 'Start'}
                      </button>
                      <button className="btn btn-ghost status-passed" onClick={async () => {
                        await handleExecute(activeStep, 'passed');
                        if (pastedImages.length > 0) { await handleUploadPasted(activeStep); }
                      }}>
                        Pass
                      </button>
                      <button className="btn btn-ghost status-failed" onClick={async () => {
                        await handleExecute(activeStep, 'failed');
                        if (pastedImages.length > 0) { await handleUploadPasted(activeStep); }
                      }}>
                        Fail
                      </button>
                      <button className="btn btn-ghost status-skipped" onClick={() => handleExecute(activeStep, 'skipped')}>
                        Skip
                      </button>
                    </div>
                  </div>
                )}

                {/* SAP Document Reference */}
                {activeAttempt && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', border: '1px solid #e2e5e9', borderRadius: '6px', background: '#fafbfc' }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px', display: 'block' }}>
                      SAP Document Reference
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select value={sapDocType} onChange={(e) => setSapDocType(e.target.value)} style={{ width: '160px', fontSize: '12px' }}>
                        <option value="FI Document">FI Document</option>
                        <option value="Cash Document">Cash Document</option>
                        <option value="Material Document">Material Document</option>
                        <option value="Sales Order">Sales Order</option>
                        <option value="Purchase Order">Purchase Order</option>
                        <option value="Delivery">Delivery</option>
                        <option value="Invoice">Invoice</option>
                        <option value="Payment">Payment</option>
                        <option value="Other">Other</option>
                      </select>
                      <input
                        placeholder="Document number..."
                        value={sapDocNum}
                        onChange={(e) => setSapDocNum(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSapObject(activeStep)}
                        style={{ flex: 1, fontSize: '12px' }}
                      />
                      <button className="btn btn-sm" onClick={() => handleAddSapObject(activeStep)}>
                        + Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload */}
                <div className="upload-section">
                  <input type="file" ref={fileRef} />
                  <button className="btn btn-sm btn-ghost" onClick={() => handleUpload(activeStep)}>Upload</button>
                </div>

                {/* Create defect */}
                <div className="defect-action">
                  <button className="btn btn-sm btn-danger-ghost" onClick={() => handleCreateDefect(activeStep)}>
                    Create Defect
                  </button>
                </div>
              </div>

              {/* Related defects */}
              {defects.filter((d) => d.step_id === activeStep).length > 0 && (
                <div className="related-defects">
                  <h4>Related Defects</h4>
                  {defects.filter((d) => d.step_id === activeStep).map((d) => (
                    <Link to={`/defects/${d.id}`} key={d.id} className="defect-link">
                      <span>#{d.id} {d.title}</span>
                      <StatusBadge status={d.status} />
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
