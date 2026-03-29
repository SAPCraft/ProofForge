import React, { useState } from 'react';

export default function JsonEditor({ value, onSave, readOnlyFields = [] }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      // Restore read-only fields
      for (const field of readOnlyFields) {
        if (value[field] !== undefined) parsed[field] = value[field];
      }
      setError(null);
      onSave(parsed);
    } catch (e) {
      setError(`Invalid JSON: ${e.message}`);
    }
  };

  return (
    <div className="json-editor">
      <textarea
        className="json-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      {error && <div className="json-error">{error}</div>}
      <div className="json-actions">
        <button className="btn btn-primary" onClick={handleSave}>
          Save JSON
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            setText(JSON.stringify(value, null, 2));
            setError(null);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
