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
  const fileRef = useRef(null);

  const load = async () => {
    const r = await api.get(`/runs/${id}`);
    setRun(r);
    if (!activeStep && r.step_executions?.length > 0) {
      const firstPending = r.step_executions.find((s) => s.current_status === 'not_started' || s.current_status === 'in_progress');
      setActiveStep(firstPending?.step_id || r.step_executions[0].step_id);
    }
    const d = await api.get(`/defects?run_id=${id}`);
    setDefects(d);
  };
  useEffect(() => { load(); }, [id]);

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
                <h3>Step {activeStepDef.order}: {activeStepDef.name}</h3>
                <div className="step-detail-meta">
                  <span className={`executor-badge ${activeStepDef.executor_type}`}>{activeStepDef.executor_type}</span>
                  <span className="action-tag">{activeStepDef.action_type}</span>
                  {activeStepDef.mandatory !== false && <span className="mandatory-tag">Mandatory</span>}
                </div>
              </div>

              {activeStepDef.description && (
                <div className="step-info-block">
                  <label>Description</label>
                  <p>{activeStepDef.description}</p>
                </div>
              )}
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
                        </div>
                        {att.comment && <p className="attempt-comment">{att.comment}</p>}

                        {/* SAP Objects */}
                        {att.sap_objects?.length > 0 && (
                          <div className="sap-objects">
                            <label>SAP Objects</label>
                            {att.sap_objects.map((obj, i) => (
                              <div key={i} className="sap-object">
                                <span className="sap-type">{obj.object_type}</span>
                                <span className="sap-id">{obj.object_id || obj.object_number}</span>
                                {obj.source_system && <span className="sap-sys">{obj.source_system}</span>}
                              </div>
                            ))}
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
                    <textarea
                      placeholder="Comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      className="comment-input"
                    />
                    <div className="execute-buttons">
                      <button className="btn btn-primary" onClick={() => handleExecute(activeStep, 'in_progress')}>
                        {activeAttempt ? 'Re-execute' : 'Start'}
                      </button>
                      <button className="btn btn-ghost status-passed" onClick={() => handleExecute(activeStep, 'passed')}>
                        Pass
                      </button>
                      <button className="btn btn-ghost status-failed" onClick={() => handleExecute(activeStep, 'failed')}>
                        Fail
                      </button>
                      <button className="btn btn-ghost status-skipped" onClick={() => handleExecute(activeStep, 'skipped')}>
                        Skip
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
