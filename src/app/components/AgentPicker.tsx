import React from 'react';
import type { AgentConfig } from '../../config/types.js';

interface Props {
  agents: AgentConfig[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onRefresh: () => void;
}

export function AgentPicker({
  agents,
  selectedIndex,
  onSelect,
  onRefresh,
}: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <select
        value={selectedIndex}
        onChange={(e) => onSelect(Number(e.target.value))}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #d0d4e4',
          fontSize: 14,
          minWidth: 240,
        }}
      >
        <option value={-1} disabled>
          Select an agent...
        </option>
        {agents.map((agent, i) => (
          <option key={agent.agentId} value={i}>
            {agent.agentName} ({agent.kind})
          </option>
        ))}
      </select>
      <button
        onClick={onRefresh}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid #d0d4e4',
          background: '#f6f7fb',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Refresh
      </button>
    </div>
  );
}
