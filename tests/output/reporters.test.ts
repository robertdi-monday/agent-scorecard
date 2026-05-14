import { describe, it, expect } from 'vitest';
import { formatJsonReport } from '../../src/output/json-reporter.js';
import { formatCliReport } from '../../src/output/cli-reporter.js';
import type { ScorecardReport } from '../../src/config/types.js';

function makeReport(overrides: Partial<ScorecardReport> = {}): ScorecardReport {
  return {
    metadata: {
      agentId: 'test-001',
      agentName: 'Test Agent',
      timestamp: '2026-05-08T00:00:00Z',
      scorecardVersion: '0.1.0',
      phasesRun: ['config-audit'],
      scoringWeights: { configAudit: 1.0 },
    },
    overallScore: 85,
    overallGrade: 'B',
    deploymentRecommendation: 'needs-fixes',
    layers: {
      configAudit: {
        score: 85,
        totalChecks: 10,
        passed: 8,
        failed: 1,
        warnings: 1,
        infoIssues: 0,
        results: [
          {
            ruleId: 'KB-001',
            ruleName: 'Knowledge base not empty',
            severity: 'critical',
            passed: true,
            message: 'Knowledge base has 3 files.',
          },
          {
            ruleId: 'PM-001',
            ruleName: 'Least-privilege permissions',
            severity: 'critical',
            passed: false,
            message: 'Agent has workspace-wide permissions.',
            recommendation: 'Narrow the agent scope.',
            owaspAsi: ['ASI-03'],
          },
        ],
      },
    },
    recommendations: [
      {
        priority: 'critical',
        category: 'PM',
        title: 'PM-001: Least-privilege permissions',
        description: 'Agent has workspace-wide permissions.',
        howToFix: 'Narrow the agent scope.',
        relatedCheckIds: ['PM-001'],
        owaspAsi: ['ASI-03'],
      },
    ],
    ...overrides,
  };
}

describe('formatJsonReport', () => {
  it('produces valid JSON', () => {
    const report = makeReport();
    const json = formatJsonReport(report);
    const parsed = JSON.parse(json);
    expect(parsed.overallScore).toBe(85);
  });

  it('preserves all report fields', () => {
    const report = makeReport();
    const json = formatJsonReport(report);
    const parsed = JSON.parse(json);
    expect(parsed.metadata.agentName).toBe('Test Agent');
    expect(parsed.recommendations).toHaveLength(1);
  });
});

describe('formatCliReport', () => {
  it('produces a string containing the agent name', () => {
    const report = makeReport();
    const output = formatCliReport(report);
    expect(output).toContain('Test Agent');
  });

  it('contains the overall score', () => {
    const report = makeReport();
    const output = formatCliReport(report);
    expect(output).toContain('85');
  });

  it('contains the grade', () => {
    const report = makeReport();
    const output = formatCliReport(report);
    expect(output).toContain('B');
  });

  it('contains recommendation section headers', () => {
    const report = makeReport();
    const output = formatCliReport(report);
    expect(output).toContain('Recommendations');
  });

  it('does not surface internal risk-tag codes in CLI tables (JSON still carries them)', () => {
    const report = makeReport();
    const output = formatCliReport(report);
    expect(output).toContain('PM-001: Least-privilege permissions');
    expect(output).not.toMatch(/\[ASI-/);
  });

  it('handles report with no recommendations', () => {
    const report = makeReport({ recommendations: [] });
    const output = formatCliReport(report);
    expect(output).not.toContain('Recommendations');
  });
});
