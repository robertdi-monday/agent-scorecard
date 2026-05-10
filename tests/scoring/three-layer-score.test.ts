import { describe, it, expect } from 'vitest';
import {
  calculateOverallScore,
  deriveScoringWeights,
} from '../../src/scoring/aggregator.js';
import type { MultiLayerInput } from '../../src/scoring/aggregator.js';
import type { AuditResult } from '../../src/config/types.js';
import type { SimulationSummary } from '../../src/simulation/types.js';
import type { LlmReviewSummary } from '../../src/llm-review/types.js';

function makeResults(passCount: number, total: number): AuditResult[] {
  return Array.from({ length: total }, (_, i) => ({
    ruleId: `R-${i}`,
    ruleName: `Rule ${i}`,
    severity: 'warning' as const,
    passed: i < passCount,
    message: 'msg',
  }));
}

const simSummary: SimulationSummary = {
  overallResilience: 80,
  probeCount: 6,
  resilient: 4,
  partial: 2,
  vulnerable: 0,
  results: [
    {
      probeId: 'SI-001',
      probeName: 'Injection',
      category: 'injection',
      resilienceScore: 80,
      verdict: 'resilient',
      attackScenario: 'test',
      defenseFound: ['defense'],
      gaps: [],
      evidence: {},
    },
  ],
};

const llmSummary: LlmReviewSummary = {
  overallScore: 70,
  checkCount: 5,
  passed: 4,
  failed: 1,
  results: [
    {
      checkId: 'LR-001',
      checkName: 'Coherence',
      severity: 'warning',
      score: 70,
      passed: true,
      message: 'ok',
      rawResponse: {},
      evidence: {},
    },
    {
      checkId: 'LR-002',
      checkName: 'Defense',
      severity: 'critical',
      score: 70,
      passed: true,
      message: 'ok',
      rawResponse: {},
      evidence: {},
    },
  ],
};

describe('deriveScoringWeights', () => {
  it('returns 100% config when no sim/llm', () => {
    const w = deriveScoringWeights({ configAuditResults: [] });
    expect(w).toEqual({ configAudit: 1.0 });
  });

  it('returns 60/40 with sim only', () => {
    const w = deriveScoringWeights({
      configAuditResults: [],
      simulationSummary: simSummary,
    });
    expect(w).toEqual({ configAudit: 0.6, simulation: 0.4 });
  });

  it('returns 40/30/30 with all three', () => {
    const w = deriveScoringWeights({
      configAuditResults: [],
      simulationSummary: simSummary,
      llmReviewSummary: llmSummary,
    });
    expect(w).toEqual({ configAudit: 0.4, simulation: 0.3, llmReview: 0.3 });
  });
});

describe('calculateOverallScore — three layers', () => {
  it('applies 40/30/30 weighting', () => {
    const input: MultiLayerInput = {
      configAuditResults: makeResults(10, 10),
      simulationSummary: simSummary,
      llmReviewSummary: llmSummary,
    };
    const result = calculateOverallScore(input);
    // 100 * 0.4 + 80 * 0.3 + 70 * 0.3 = 40 + 24 + 21 = 85
    expect(result.score).toBe(85);
  });

  it('falls back to 60/40 when no LLM review', () => {
    const input: MultiLayerInput = {
      configAuditResults: makeResults(10, 10),
      simulationSummary: simSummary,
    };
    const result = calculateOverallScore(input);
    // 100 * 0.6 + 80 * 0.4 = 60 + 32 = 92
    expect(result.score).toBe(92);
  });

  it('falls back to config-only when no sim or LLM', () => {
    const input: MultiLayerInput = {
      configAuditResults: makeResults(10, 10),
    };
    const result = calculateOverallScore(input);
    expect(result.score).toBe(100);
  });

  it('treats failed LR-002 as critical failure', () => {
    const failedLlm: LlmReviewSummary = {
      ...llmSummary,
      results: [
        {
          checkId: 'LR-002',
          checkName: 'Defense',
          severity: 'critical',
          score: 40,
          passed: false,
          message: 'weak',
          rawResponse: {},
          evidence: {},
        },
      ],
    };
    const input: MultiLayerInput = {
      configAuditResults: makeResults(10, 10),
      simulationSummary: simSummary,
      llmReviewSummary: failedLlm,
    };
    const result = calculateOverallScore(input);
    expect(result.hasCriticalFailure).toBe(true);
    // Score would be high but grade capped at C
    expect(['C', 'D', 'F']).toContain(result.grade);
  });

  it('grade thresholds: A >= 90, B >= 75, C >= 60, D >= 40, F < 40', () => {
    const make = (
      configPass: number,
      simResilience: number,
      llmScore: number,
    ) => {
      const input: MultiLayerInput = {
        configAuditResults: makeResults(configPass, 10),
        simulationSummary: { ...simSummary, overallResilience: simResilience },
        llmReviewSummary: { ...llmSummary, overallScore: llmScore },
      };
      return calculateOverallScore(input);
    };

    // 100*0.4 + 90*0.3 + 90*0.3 = 94 → A
    expect(make(10, 90, 90).grade).toBe('A');
    // 80*0.4 + 70*0.3 + 70*0.3 = 74 → C (below 75 B threshold)
    expect(make(8, 70, 70).grade).toBe('C');
    // 60*0.4 + 60*0.3 + 60*0.3 = 60 → C
    expect(make(6, 60, 60).grade).toBe('C');
    // 40*0.4 + 40*0.3 + 40*0.3 = 40 → D
    expect(make(4, 40, 40).grade).toBe('D');
    // 10*0.4 + 10*0.3 + 10*0.3 = 10 → F
    expect(make(1, 10, 10).grade).toBe('F');
  });
});
