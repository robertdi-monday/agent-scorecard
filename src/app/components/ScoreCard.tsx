import React from 'react';
import type { ScorecardReport } from '../../config/types.js';
import { GradeWheel } from './GradeWheel.js';

const REC_COLORS: Record<string, { bg: string; fg: string }> = {
  ready: { bg: '#e6f9f0', fg: '#00854d' },
  'needs-fixes': { bg: '#fff8e6', fg: '#c27a00' },
  'not-ready': { bg: '#fde8ec', fg: '#d83a52' },
};

interface Props {
  report: ScorecardReport;
}

export function ScoreCard({ report }: Props) {
  const rec =
    REC_COLORS[report.deploymentRecommendation] ?? REC_COLORS['not-ready'];
  const audit = report.layers.configAudit;
  const sim = report.layers.simulation;

  return (
    <div
      style={{
        display: 'flex',
        gap: 32,
        alignItems: 'center',
        padding: 24,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      <GradeWheel grade={report.overallGrade} score={report.overallScore} />

      <div style={{ flex: 1 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>
          {report.metadata.agentName}
        </h2>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            background: rec.bg,
            color: rec.fg,
          }}
        >
          {report.deploymentRecommendation.replace('-', ' ')}
        </span>

        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 16,
            fontSize: 13,
            color: '#666',
          }}
        >
          <span>
            <strong>{audit.totalChecks}</strong> checks
          </span>
          <span style={{ color: '#00854d' }}>
            <strong>{audit.passed}</strong> passed
          </span>
          <span style={{ color: '#d83a52' }}>
            <strong>{audit.failed}</strong> failed
          </span>
          <span style={{ color: '#c27a00' }}>
            <strong>{audit.warnings}</strong> warnings
          </span>
          <span style={{ color: '#597bfc' }}>
            <strong>{audit.infoIssues}</strong> info
          </span>
        </div>

        {sim && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            Resilience:{' '}
            <strong
              style={{
                color:
                  sim.overallResilience >= 70
                    ? '#00854d'
                    : sim.overallResilience >= 40
                      ? '#c27a00'
                      : '#d83a52',
              }}
            >
              {sim.overallResilience}/100
            </strong>{' '}
            ({sim.resilient} resilient · {sim.partial} partial ·{' '}
            {sim.vulnerable} vulnerable)
          </div>
        )}
      </div>
    </div>
  );
}
