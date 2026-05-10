import type { AgentConfig, AuditResult } from '../config/types.js';
import type {
  LlmClient,
  LlmReviewResult,
  LlmReviewSummary,
  TailoredFix,
} from './types.js';
import { instructionCoherenceCheck } from './checks/lr-001-instruction-coherence.js';
import { defenseQualityCheck } from './checks/lr-002-defense-quality.js';
import { toolGoalAlignmentCheck } from './checks/lr-003-tool-goal-alignment.js';
import { kbRelevanceCheck } from './checks/lr-004-kb-relevance.js';
import {
  runTailoredRecommendations,
  extractTailoredFixes,
} from './checks/lr-005-tailored-recommendations.js';

const PHASE_1_CHECKS = [
  instructionCoherenceCheck,
  defenseQualityCheck,
  toolGoalAlignmentCheck,
  kbRelevanceCheck,
];

/**
 * Run all LLM review checks in two phases:
 *   Phase 1: LR-001 through LR-004 in parallel
 *   Phase 2: LR-005 (tailored recommendations) serial, consuming Phase 1 results
 */
export async function runLlmReview(
  config: AgentConfig,
  client: LlmClient,
  failedRules: AuditResult[] = [],
  simulationGaps: string[] = [],
): Promise<LlmReviewSummary> {
  // Phase 1: run scoring checks in parallel, isolating failures
  const phase1Results = await Promise.all(
    PHASE_1_CHECKS.map(async (check): Promise<LlmReviewResult> => {
      try {
        return await check.run(config, client);
      } catch (err) {
        return {
          checkId: check.id,
          checkName: check.name,
          severity: check.severity,
          score: 0,
          passed: false,
          message: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
          rawResponse: {},
          evidence: { error: err instanceof Error ? err.message : String(err) },
          owaspAsi: check.owaspAsi,
        };
      }
    }),
  );

  // Phase 2: tailored recommendations, consuming phase 1 output
  let lr005Result: LlmReviewResult;
  try {
    lr005Result = await runTailoredRecommendations(
      config,
      client,
      phase1Results,
      failedRules,
      simulationGaps,
    );
  } catch (err) {
    lr005Result = {
      checkId: 'LR-005',
      checkName: 'Tailored Recommendations',
      severity: 'info',
      score: 100,
      passed: true,
      message: `Recommendation generation failed: ${err instanceof Error ? err.message : String(err)}`,
      rawResponse: {},
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  const allResults = [...phase1Results, lr005Result];

  // Score average excludes LR-005 (always passes, info-only)
  const scoredResults = phase1Results;
  const overallScore =
    scoredResults.length > 0
      ? Math.round(
          (scoredResults.reduce((sum, r) => sum + r.score, 0) /
            scoredResults.length) *
            10,
        ) / 10
      : 100;

  const tailoredFixes = extractTailoredFixesFromResult(lr005Result);

  return {
    overallScore,
    checkCount: allResults.length,
    passed: allResults.filter((r) => r.passed).length,
    failed: allResults.filter((r) => !r.passed).length,
    results: allResults,
    tailoredFixes: tailoredFixes.length > 0 ? tailoredFixes : undefined,
  };
}

function extractTailoredFixesFromResult(
  result: LlmReviewResult,
): TailoredFix[] {
  const evidence = result.evidence;
  if (Array.isArray(evidence.fixes)) {
    return evidence.fixes.filter(
      (f): f is TailoredFix =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as TailoredFix).instructionText === 'string',
    );
  }
  return [];
}
