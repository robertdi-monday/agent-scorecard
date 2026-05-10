import React, { useState } from 'react';
import type { SimulationResultEntry } from '../../config/types.js';

const VERDICT_STYLES: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  resilient: { bg: '#e6f9f0', fg: '#00854d', label: 'RESILIENT' },
  partial: { bg: '#fff8e6', fg: '#c27a00', label: 'PARTIAL' },
  vulnerable: { bg: '#fde8ec', fg: '#d83a52', label: 'VULNERABLE' },
};

interface Props {
  results: SimulationResultEntry[];
}

export function SimulationResults({ results }: Props) {
  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Simulation Probes</h3>
      {results.map((r) => (
        <ProbeRow key={r.probeId} result={r} />
      ))}
    </div>
  );
}

function ProbeRow({ result }: { result: SimulationResultEntry }) {
  const [expanded, setExpanded] = useState(false);
  const v = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.vulnerable;

  return (
    <div
      style={{
        border: '1px solid #e6e9ef',
        borderRadius: 8,
        marginBottom: 8,
        padding: '12px 14px',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, minWidth: 60 }}>
          {result.probeId}
        </span>
        <span style={{ flex: 1, fontSize: 13 }}>{result.probeName}</span>
        <ResilienceBar score={result.resilienceScore} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            background: v.bg,
            color: v.fg,
          }}
        >
          {v.label}
        </span>
      </div>

      <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>
        {result.attackScenario}
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingLeft: 12, fontSize: 12 }}>
          {result.defenseFound.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong style={{ color: '#00854d' }}>Defenses found:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                {result.defenseFound.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {result.gaps.length > 0 && (
            <div>
              <strong style={{ color: '#d83a52' }}>Gaps:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                {result.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResilienceBar({ score }: { score: number }) {
  const color = score >= 70 ? '#00CA72' : score >= 40 ? '#FDAB3D' : '#E44258';
  return (
    <div
      style={{
        width: 80,
        height: 8,
        background: '#eee',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.min(score, 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 4,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}
