import React, { useCallback } from 'react';
import type { Recommendation } from '../../config/types.js';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#d83a52',
  high: '#c27a00',
  medium: '#597bfc',
  low: '#999',
};

interface Props {
  recommendations: Recommendation[];
}

export function RecommendationPanel({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <div style={{ color: '#00854d', fontSize: 14, padding: 12 }}>
        No recommendations — all checks passed.
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Recommendations</h3>
      {recommendations.map((rec, i) => (
        <RecCard key={i} rec={rec} />
      ))}
    </div>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const color = PRIORITY_COLORS[rec.priority] ?? '#999';

  const copyFix = useCallback(() => {
    navigator.clipboard.writeText(rec.howToFix).catch(() => {});
  }, [rec.howToFix]);

  return (
    <div
      style={{
        border: '1px solid #e6e9ef',
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            color,
          }}
        >
          {rec.priority}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{rec.title}</span>
        {rec.owaspAsi && rec.owaspAsi.length > 0 && (
          <span style={{ fontSize: 11, color: '#999' }}>
            [{rec.owaspAsi.join(', ')}]
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
        {rec.description}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            background: '#f6f7fb',
            padding: '6px 10px',
            borderRadius: 6,
            color: '#333',
          }}
        >
          <strong>Fix:</strong> {rec.howToFix}
        </div>
        <button
          onClick={copyFix}
          title="Copy fix to clipboard"
          style={{
            padding: '4px 10px',
            border: '1px solid #d0d4e4',
            borderRadius: 6,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          Copy
        </button>
      </div>
    </div>
  );
}
