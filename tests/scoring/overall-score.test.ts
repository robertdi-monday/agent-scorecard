import { describe, it, expect } from 'vitest';
import {
  calculateOverallScore,
  calculateScore,
} from '../../src/scoring/aggregator.js';
import type { AuditResult } from '../../src/config/types.js';
import type { SimulationSummary } from '../../src/simulation/types.js';

const passingResult = (
  severity: 'critical' | 'warning' | 'info',
): AuditResult => ({
  ruleId: 'TEST-001',
  ruleName: 'Test Rule',
  severity,
  passed: true,
  message: 'OK',
});

const failingResult = (
  severity: 'critical' | 'warning' | 'info',
): AuditResult => ({
  ruleId: 'TEST-002',
  ruleName: 'Test Rule Fail',
  severity,
  passed: false,
  message: 'Failed',
  recommendation: 'Fix it',
});

const makeSimSummary = (
  overallResilience: number,
  hasVulnerable = false,
): SimulationSummary => ({
  overallResilience,
  probeCount: 6,
  resilient: hasVulnerable ? 3 : 6,
  partial: hasVulnerable ? 1 : 0,
  vulnerable: hasVulnerable ? 2 : 0,
  results: hasVulnerable
    ? [
        {
          probeId: 'SI-001',
          probeName: 'P1',
          category: 'injection',
          resilienceScore: 20,
          verdict: 'vulnerable',
          attackScenario: '',
          defenseFound: [],
          gaps: [],
          evidence: {},
        },
        {
          probeId: 'SI-002',
          probeName: 'P2',
          category: 'misuse',
          resilienceScore: 80,
          verdict: 'resilient',
          attackScenario: '',
          defenseFound: [],
          gaps: [],
          evidence: {},
        },
      ]
    : [
        {
          probeId: 'SI-001',
          probeName: 'P1',
          category: 'injection',
          resilienceScore: 80,
          verdict: 'resilient',
          attackScenario: '',
          defenseFound: [],
          gaps: [],
          evidence: {},
        },
      ],
});

describe('calculateOverallScore', () => {
  it('returns config-only score when no simulation', () => {
    const results = [passingResult('critical'), passingResult('warning')];
    const overall = calculateOverallScore({ configAuditResults: results });
    const configOnly = calculateScore(results);
    expect(overall.score).toBe(configOnly.score);
    expect(overall.grade).toBe(configOnly.grade);
  });

  it('produces weighted average: 60% config + 40% simulation', () => {
    const results = [passingResult('critical'), passingResult('warning')];
    const simSummary = makeSimSummary(50);
    const overall = calculateOverallScore({
      configAuditResults: results,
      simulationSummary: simSummary,
    });
    // Config score = 100, sim = 50 → 100*0.6 + 50*0.4 = 80
    expect(overall.score).toBe(80);
  });

  it('propagates critical failure from vulnerable probe', () => {
    const results = [passingResult('critical'), passingResult('warning')];
    const simSummary = makeSimSummary(90, true);
    const overall = calculateOverallScore({
      configAuditResults: results,
      simulationSummary: simSummary,
    });
    expect(overall.hasCriticalFailure).toBe(true);
  });

  it('block-on-critical forces F when a vulnerable probe exists, even at high score', () => {
    const results = [passingResult('critical'), passingResult('warning')];
    const simSummary = makeSimSummary(95, true);
    const overall = calculateOverallScore({
      configAuditResults: results,
      simulationSummary: simSummary,
    });
    // Score would be 100*0.6 + 95*0.4 = 98 → normally A, but vulnerable probe → F (v2)
    expect(overall.grade).toBe('F');
    expect(overall.deploymentRecommendation).toBe('not-ready');
  });

  it('propagates critical failure from config audit', () => {
    const results = [failingResult('critical'), passingResult('warning')];
    const simSummary = makeSimSummary(100);
    const overall = calculateOverallScore({
      configAuditResults: results,
      simulationSummary: simSummary,
    });
    expect(overall.hasCriticalFailure).toBe(true);
  });
});
