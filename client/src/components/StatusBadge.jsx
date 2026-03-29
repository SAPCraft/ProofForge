import React from 'react';

const STATUS_COLORS = {
  draft: { bg: '#f0f0f0', color: '#666' },
  ready: { bg: '#e3f2fd', color: '#1565c0' },
  archived: { bg: '#f5f5f5', color: '#999' },
  approved: { bg: '#e8f5e9', color: '#2e7d32' },
  active: { bg: '#e3f2fd', color: '#1565c0' },
  planned: { bg: '#fff3e0', color: '#e65100' },
  in_progress: { bg: '#e3f2fd', color: '#1565c0' },
  completed: { bg: '#e8f5e9', color: '#2e7d32' },
  blocked: { bg: '#fce4ec', color: '#c62828' },
  cancelled: { bg: '#f5f5f5', color: '#999' },
  not_started: { bg: '#f0f0f0', color: '#666' },
  passed: { bg: '#e8f5e9', color: '#2e7d32' },
  passed_with_comments: { bg: '#fff8e1', color: '#f57f17' },
  failed: { bg: '#fce4ec', color: '#c62828' },
  skipped: { bg: '#f5f5f5', color: '#999' },
  pending: { bg: '#fff3e0', color: '#e65100' },
  waived: { bg: '#f3e5f5', color: '#7b1fa2' },
  open: { bg: '#fce4ec', color: '#c62828' },
  fixed: { bg: '#e8f5e9', color: '#2e7d32' },
  ready_for_retest: { bg: '#fff3e0', color: '#e65100' },
  closed: { bg: '#e8f5e9', color: '#2e7d32' },
  rejected: { bg: '#f5f5f5', color: '#999' },
};

export default function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: '#f0f0f0', color: '#333' };
  return (
    <span
      className="status-badge"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {(status || '').replace(/_/g, ' ')}
    </span>
  );
}
