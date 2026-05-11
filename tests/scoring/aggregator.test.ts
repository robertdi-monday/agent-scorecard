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

/** Uniform info-level rules: score = (passedCount / total) × 100 (one decimal). */
function infoOnlyResults(passedCount: number, total: number): AuditResult[] {
  return Array.from({ length: total }, (_, i) =>
    makeResult({
      ruleId: `R-${String(i).padStart(3, '0')}`,
      severity: 'info',
      passed: i < passedCount,
    }),
  );
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

  it('calculates weighted score correctly with v2 weights (10:3:1)', () => {
    // 1 critical pass (10), 1 warning fail (3), 1 info pass (1)
    // passed weight = 10 + 1 = 11, total weight = 10 + 3 + 1 = 14
    // score = 11/14 * 100 = 78.6 → Grade B
    const results: AuditResult[] = [
      makeResult({ ruleId: 'R-001', severity: 'critical', passed: true }),
      makeResult({ ruleId: 'R-002', severity: 'warning', passed: false }),
      makeResult({ ruleId: 'R-003', severity: 'info', passed: true }),
    ];
    const score = calculateScore(results);
    expect(score.score).toBe(78.6);
    expect(score.grade).toBe('B');
  });

  it('block-on-critical forces F when any critical rule fails', () => {
    // Even with 11 passing info rules, a single failed critical → F.
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
    // Raw score: (11*1)/(10 + 11*1) * 100 = 11/21 * 100 = 52.4 → Grade D
    // But block-on-critical forces F.
    expect(score.score).toBe(52.4);
    expect(score.grade).toBe('F');
    expect(score.hasCriticalFailure).toBe(true);
    expect(score.deploymentRecommendation).toBe('not-ready');
  });

  it('returns A/100 when given empty results', () => {
    const score = calculateScore([]);
    expect(score.score).toBe(100);
    expect(score.grade).toBe('A');
    expect(score.deploymentRecommendation).toBe('ready');
  });

  describe('grade thresholds (GRADE_THRESHOLDS)', () => {
    it('A at 90%, B at 89%', () => {
      expect(calculateScore(infoOnlyResults(90, 100)).grade).toBe('A');
      expect(calculateScore(infoOnlyResults(89, 100)).grade).toBe('B');
      expect(
        calculateScore(infoOnlyResults(90, 100)).deploymentRecommendation,
      ).toBe('ready');
      expect(
        calculateScore(infoOnlyResults(89, 100)).deploymentRecommendation,
      ).toBe('needs-fixes');
    });

    it('B at 75%, C at 74% (GRADE_THRESHOLDS B=75, C=60)', () => {
      expect(calculateScore(infoOnlyResults(75, 100)).grade).toBe('B');
      expect(calculateScore(infoOnlyResults(74, 100)).grade).toBe('C');
    });

    it('C at 60%, D at 59%', () => {
      expect(calculateScore(infoOnlyResults(60, 100)).grade).toBe('C');
      expect(calculateScore(infoOnlyResults(59, 100)).grade).toBe('D');
    });

    it('D at 40%, F at 39%', () => {
      expect(calculateScore(infoOnlyResults(40, 100)).grade).toBe('D');
      expect(calculateScore(infoOnlyResults(39, 100)).grade).toBe('F');
      expect(
        calculateScore(infoOnlyResults(39, 100)).deploymentRecommendation,
      ).toBe('not-ready');
    });
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

  it('uses category General when ruleId has no prefix before hyphen', () => {
    const results: AuditResult[] = [
      makeResult({
        ruleId: '',
        severity: 'warning',
        passed: false,
        recommendation: 'Fix',
      }),
    ];
    const recs = buildRecommendations(results);
    expect(recs[0].category).toBe('General');
  });

  it('maps unknown severity to low priority', () => {
    const results: AuditResult[] = [
      makeResult({
        ruleId: 'X-001',
        severity: 'warning',
        passed: false,
        recommendation: 'Fix',
      }),
    ];
    (results[0] as { severity: string }).severity = 'unknown';
    const recs = buildRecommendations(results as AuditResult[]);
    expect(recs[0].priority).toBe('low');
  });
});
