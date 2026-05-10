import React, { useState } from 'react';

interface Props {
  apiKey: string;
  onChange: (key: string) => void;
}

export function ApiKeySettings({ apiKey, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState(apiKey);

  const handleSave = () => {
    onChange(inputValue.trim());
  };

  return (
    <div
      style={{
        border: '1px solid #e6e9ef',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          LLM Review Settings
        </span>
        <span style={{ fontSize: 12, color: '#777' }}>
          {apiKey ? 'Configured' : 'Not configured'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              color: '#555',
              marginBottom: 4,
            }}
          >
            Anthropic API Key
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: 13,
                border: '1px solid #d0d4e4',
                borderRadius: 6,
                outline: 'none',
              }}
            />
            <button
              onClick={handleSave}
              style={{
                padding: '6px 16px',
                fontSize: 13,
                borderRadius: 6,
                border: '1px solid #0073ea',
                background: '#0073ea',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#999', margin: '6px 0 0' }}>
            Key is stored per app instance. Enables semantic review checks
            (LR-001 through LR-005).
          </p>
        </div>
      )}
    </div>
  );
}
