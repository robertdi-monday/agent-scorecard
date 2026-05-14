import React, { useState } from 'react';
import type { AuditResult } from '../../config/types.js';

const SEV_COLORS: Record<string, string> = {
  critical: '#d83a52',
  warning: '#c27a00',
  info: '#597bfc',
};

interface Props {
  results: AuditResult[];
}

export function RuleResults({ results }: Props) {
  const grouped = groupByCategory(results);

  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Audit Results</h3>
      {Object.entries(grouped).map(([category, items]) => (
        <CategoryGroup key={category} category={category} items={items} />
      ))}
    </div>
  );
}

function CategoryGroup({
  category,
  items,
}: {
  category: string;
  items: AuditResult[];
}) {
  const [open, setOpen] = useState(false);
  const failCount = items.filter((r) => !r.passed).length;

  return (
    <div
      style={{
        border: '1px solid #e6e9ef',
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          border: 'none',
          background: open ? '#f6f7fb' : '#fff',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span>
          {open ? '▾' : '▸'} {category} ({items.length})
        </span>
        {failCount > 0 && (
          <span
            style={{
              background: '#fde8ec',
              color: '#d83a52',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
            }}
          >
            {failCount} failed
          </span>
        )}
      </button>
      {open && (
        <div style={{ padding: '4px 14px 10px' }}>
          {items.map((r) => (
            <RuleRow key={r.ruleId} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleRow({ result }: { result: AuditResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        padding: '8px 0',
        borderBottom: '1px solid #f0f1f5',
        fontSize: 13,
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>{result.passed ? '✅' : '❌'}</span>
        <span style={{ fontWeight: 600 }}>
          {result.ruleId}: {result.ruleName}
        </span>
        <span
          style={{
            fontSize: 11,
            color: SEV_COLORS[result.severity] ?? '#666',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {result.severity}
        </span>
      </div>
      <div style={{ color: '#555', marginTop: 4 }}>{result.message}</div>
      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 28, color: '#777' }}>
          {result.recommendation && (
            <div style={{ marginBottom: 6 }}>
              <strong>Fix:</strong> {result.recommendation}
            </div>
          )}
          {result.evidence && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12 }}>
                Evidence
              </summary>
              <pre
                style={{
                  fontSize: 11,
                  background: '#f6f7fb',
                  padding: 8,
                  borderRadius: 6,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(result.evidence, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function groupByCategory(
  results: AuditResult[],
): Record<string, AuditResult[]> {
  const groups: Record<string, AuditResult[]> = {};
  for (const r of results) {
    const cat = r.ruleId.split('-')[0] || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(r);
  }
  return groups;
}
