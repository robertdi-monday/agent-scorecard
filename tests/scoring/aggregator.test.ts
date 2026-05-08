import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  buildRecommendations,
} from '../../src/scoring/aggregator.js';
import type { AuditResult } from '../../src/config/types.js';

function makeResult(
  overrides: Partial<AuditResult> & { ruleId: string },
): AuditResult {
  return {
    ruleName: overrides.ruleId,
    severity: 'warning',
    passed: true,
    message: 'test',
    ...overrides,
  };
}

describe('calculateScore', () => {
  it('returns 100 and Grade A when all rules pass', () => {
    const results: AuditResult[] = [
      makeResult({ ruleId: 'R-001', severity: 'critical', passed: true }),
      makeResult({ ruleId: 'R-002', severity: 'warning', passed: true }),
      makeResult({ ruleId: 'R-003', severity: 'info', passed: true }),
    ];
    const score = calculateScore(results);
    expect(score.score).toBe(100);
    expect(score.grade).toBe('A');
    expect(score.deploymentRecommendation).toBe('ready');
  });

  it('returns 0 and Grade F when all rules fail', () => {
    const results: AuditResult[] = [
      makeResult({ ruleId: 'R-001', severity: 'critical', passed: false }),
      makeResult({ ruleId: 'R-002', severity: 'warning', passed: false }),
      makeResult({ ruleId: 'R-003', severity: 'info', passed: false }),
    ];
    const score = calculateScore(results);
    expect(score.score).toBe(0);
    expect(score.grade).toBe('F');
    expect(score.deploymentRecommendation).toBe('not-ready');
  });

  it('calculates weighted score correctly', () => {
    // 1 critical pass (3), 1 warning fail (2), 1 info pass (1)
    // passed weight = 3 + 1 = 4, total weight = 3 + 2 + 1 = 6
    // score = 4/6 * 100 = 66.7
    const results: AuditResult[] = [
      makeResult({ ruleId: 'R-001', severity: 'critical', passed: true }),
      makeResult({ ruleId: 'R-002', severity: 'warning', passed: false }),
      makeResult({ ruleId: 'R-003', severity: 'info', passed: true }),
    ];
    const score = calculateScore(results);
    expect(score.score).toBe(66.7);
    expect(score.grade).toBe('C');
  });

  it('caps grade at C when a critical rule fails', () => {
    // Enough passing rules to get a high score, but one critical failure
    const results: AuditResult[] = [
      makeResult({ ruleId: 'R-001', severity: 'critical', passed: false }),
      makeResult({ ruleId: 'R-002', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-003', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-004', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-005', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-006', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-007', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-008', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-009', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-010', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-011', severity: 'info', passed: true }),
      makeResult({ ruleId: 'R-012', severity: 'info', passed: true }),
    ];
    const score = calculateScore(results);
    // Raw score: (11*1)/(3 + 11*1) * 100 = 11/14 * 100 = 78.6 → Grade B
    // But hard fail caps at C
    expect(score.score).toBe(78.6);
    expect(score.grade).toBe('C');
    expect(score.hasCriticalFailure).toBe(true);
    expect(score.deploymentRecommendation).toBe('needs-fixes');
  });

  it('returns A/100 when given empty results', () => {
    const score = calculateScore([]);
    expect(score.score).toBe(100);
    expect(score.grade).toBe('A');
  });

  it('sets hasCriticalFailure to false when no critical rules fail', () => {
    const results: AuditResult[] = [
      makeResult({ ruleId: 'R-001', severity: 'warning', passed: false }),
    ];
    const score = calculateScore(results);
    expect(score.hasCriticalFailure).toBe(false);
  });
});

describe('buildRecommendations', () => {
  it('returns empty array when all rules pass', () => {
    const results: AuditResult[] = [
      makeResult({ ruleId: 'R-001', passed: true }),
    ];
    const recs = buildRecommendations(results);
    expect(recs).toHaveLength(0);
  });

  it('creates recommendations for failed rules with recommendations', () => {
    const results: AuditResult[] = [
      makeResult({
        ruleId: 'R-001',
        severity: 'critical',
        passed: false,
        recommendation: 'Fix this',
      }),
    ];
    const recs = buildRecommendations(results);
    expect(recs).toHaveLength(1);
    expect(recs[0].priority).toBe('critical');
  });

  it('sorts recommendations by priority then rule ID', () => {
    const results: AuditResult[] = [
      makeResult({
        ruleId: 'Z-002',
        severity: 'warning',
        passed: false,
        recommendation: 'Fix Z',
      }),
      makeResult({
        ruleId: 'A-001',
        severity: 'critical',
        passed: false,
        recommendation: 'Fix A',
      }),
      makeResult({
        ruleId: 'B-003',
        severity: 'info',
        passed: false,
        recommendation: 'Fix B',
      }),
    ];
    const recs = buildRecommendations(results);
    expect(recs[0].relatedCheckIds[0]).toBe('A-001');
    expect(recs[1].relatedCheckIds[0]).toBe('Z-002');
    expect(recs[2].relatedCheckIds[0]).toBe('B-003');
  });

  it('skips failed rules without a recommendation string', () => {
    const results: AuditResult[] = [
      makeResult({
        ruleId: 'R-001',
        passed: false,
      }),
    ];
    const recs = buildRecommendations(results);
    expect(recs).toHaveLength(0);
  });
});
