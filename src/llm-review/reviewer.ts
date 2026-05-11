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
import { runTailoredRecommendations } from './checks/lr-005-tailored-recommendations.js';
import { toolOutputTrustCheck } from './checks/lr-006-tool-output-trust.js';
import { defensePositioningCheck } from './checks/lr-007-defense-positioning.js';
import { refusalConcretenessCheck } from './checks/lr-008-refusal-concreteness.js';
import { personaDriftCheck } from './checks/lr-009-persona-drift.js';
import { goalSpecificityCheck } from './checks/lr-010-goal-specificity.js';
import { LOW_CONFIDENCE_VARIANCE_THRESHOLD } from '../config/constants.js';

const PHASE_1_CHECKS = [
  instructionCoherenceCheck,
  defenseQualityCheck,
  toolGoalAlignmentCheck,
  kbRelevanceCheck,
  toolOutputTrustCheck,
  defensePositioningCheck,
  refusalConcretenessCheck,
  personaDriftCheck,
  goalSpecificityCheck,
];

/**
 * Run all LLM review checks in two phases:
 *   Phase 1: Q-002, S-003, Q-003, LR-004 in parallel
 *   Phase 2: Q-004 (tailored fixes) serial, consuming Phase 1 results
 */
export async function runLlmReview(
  config: AgentConfig,
  client: LlmClient,
  failedRules: AuditResult[] = [],
  simulationGaps: string[] = [],
): Promise<LlmReviewSummary> {
  // Phase 1: run scoring checks in parallel, isolating failures.
  // After a result returns, lift the `_samples` / `_variance` annotations the
  // sampled LR checks stash on `evidence` up to top-level fields, and tag the
  // result `lowConfidence` if the judges disagreed substantially. This keeps
  // both the CLI reporter and JSON consumers from reaching into evidence.
  const phase1Results = await Promise.all(
    PHASE_1_CHECKS.map(async (check): Promise<LlmReviewResult> => {
      try {
        const result = await check.run(config, client);
        return annotateConfidence(result);
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
  let q004Result: LlmReviewResult;
  try {
    q004Result = await runTailoredRecommendations(
      config,
      client,
      phase1Results,
      failedRules,
      simulationGaps,
    );
  } catch (err) {
    q004Result = {
      checkId: 'Q-004',
      checkName: 'Tailored Fixes',
      severity: 'info',
      score: 100,
      passed: true,
      message: `Recommendation generation failed: ${err instanceof Error ? err.message : String(err)}`,
      rawResponse: {},
      evidence: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  const allResults = [...phase1Results, q004Result];

  // Score average excludes Q-004 (always passes, info-only)
  const scoredResults = phase1Results;
  const overallScore =
    scoredResults.length > 0
      ? Math.round(
          (scoredResults.reduce((sum, r) => sum + r.score, 0) /
            scoredResults.length) *
            10,
        ) / 10
      : 100;

  const tailoredFixes = extractTailoredFixesFromResult(q004Result);

  return {
    overallScore,
    checkCount: allResults.length,
    passed: allResults.filter((r) => r.passed).length,
    failed: allResults.filter((r) => !r.passed).length,
    results: allResults,
    tailoredFixes: tailoredFixes.length > 0 ? tailoredFixes : undefined,
  };
}

/**
 * Promote `_samples` / `_variance` from `evidence` (where the sampled LR
 * checks deposit them) to top-level fields, and set `lowConfidence` if the
 * spread is large enough that the median is not actionable on its own.
 *
 * Single-judge results (descriptive checks) leave the fields undefined so the
 * reporters can render them as "n/a" rather than misleading zero-variance.
 */
function annotateConfidence(result: LlmReviewResult): LlmReviewResult {
  const ev = result.evidence ?? {};
  const samples = typeof ev._samples === 'number' ? ev._samples : undefined;
  const variance = typeof ev._variance === 'number' ? ev._variance : undefined;

  if (samples === undefined || samples <= 1) {
    // Either descriptive single-judge check, or sampled checks with only one
    // surviving sample (the rest threw) — neither benefits from a stddev tag.
    return result;
  }

  return {
    ...result,
    samples,
    variance,
    lowConfidence:
      typeof variance === 'number' &&
      variance >= LOW_CONFIDENCE_VARIANCE_THRESHOLD,
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
