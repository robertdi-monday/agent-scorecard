import type {
  AuditResult,
  DeploymentRecommendation,
  Grade,
  Recommendation,
  ScorecardScore,
} from '../config/types.js';
import type { SimulationSummary } from '../simulation/types.js';
import type { LlmReviewSummary } from '../llm-review/types.js';
import { SEVERITY_WEIGHTS, GRADE_THRESHOLDS } from '../config/constants.js';

/**
 * Calculate the overall score from audit results using severity-weighted scoring.
 *
 * - Weights: critical=3, warning=2, info=1
 * - Score = (sum of passed weights / sum of all weights) × 100
 * - Hard fail: any critical failure caps grade at C, recommendation at 'needs-fixes'
 */
export function calculateScore(results: AuditResult[]): ScorecardScore {
  if (results.length === 0) {
    return {
      score: 100,
      grade: 'A',
      deploymentRecommendation: 'ready',
      hasCriticalFailure: false,
      totalWeight: 0,
      passedWeight: 0,
    };
  }

  let totalWeight = 0;
  let passedWeight = 0;
  let hasCriticalFailure = false;

  for (const result of results) {
    const weight = SEVERITY_WEIGHTS[result.severity];
    totalWeight += weight;
    if (result.passed) {
      passedWeight += weight;
    } else if (result.severity === 'critical') {
      hasCriticalFailure = true;
    }
  }

  const rawScore = totalWeight > 0 ? (passedWeight / totalWeight) * 100 : 100;
  const score = Math.round(rawScore * 10) / 10; // one decimal place

  let grade = scoreToGrade(score);

  // Hard fail: any critical failure caps grade at C
  if (hasCriticalFailure && gradeRank(grade) < gradeRank('C')) {
    grade = 'C';
  }

  const deploymentRecommendation = gradeToRecommendation(grade);

  return {
    score,
    grade,
    deploymentRecommendation,
    hasCriticalFailure,
    totalWeight,
    passedWeight,
  };
}

// ── Multi-layer scoring ──────────────────────────────────────────────────────

export interface MultiLayerInput {
  configAuditResults: AuditResult[];
  simulationSummary?: SimulationSummary;
  llmReviewSummary?: LlmReviewSummary;
}

export interface ScoringWeights {
  configAudit: number;
  simulation?: number;
  llmReview?: number;
}

/**
 * Derive the scoring weights used for a given input combination.
 * Deterministic from which layers are present:
 *   - config only: 100%
 *   - config + sim: 60/40
 *   - config + sim + llm: 40/30/30
 */
export function deriveScoringWeights(input: MultiLayerInput): ScoringWeights {
  if (input.llmReviewSummary && input.simulationSummary) {
    return { configAudit: 0.4, simulation: 0.3, llmReview: 0.3 };
  }
  if (input.simulationSummary) {
    return { configAudit: 0.6, simulation: 0.4 };
  }
  return { configAudit: 1.0 };
}

/**
 * Calculate overall score combining available layers.
 *
 * Weight distribution is deterministic from which layers are present:
 *   - config only:            100% config
 *   - config + simulation:     60% config / 40% simulation
 *   - config + sim + LLM:      40% config / 30% sim / 30% LLM
 *
 * Critical failure sources:
 *   - Any failed critical config rule
 *   - Any vulnerable simulation probe
 *   - Failed LR-002 (Defense Quality, critical severity)
 */
export function calculateOverallScore(input: MultiLayerInput): ScorecardScore {
  const configScore = calculateScore(input.configAuditResults);

  if (!input.simulationSummary && !input.llmReviewSummary) {
    return configScore;
  }

  const weights = deriveScoringWeights(input);
  let weightedScore = configScore.score * weights.configAudit;

  if (input.simulationSummary && weights.simulation) {
    weightedScore +=
      input.simulationSummary.overallResilience * weights.simulation;
  }

  if (input.llmReviewSummary && weights.llmReview) {
    weightedScore += input.llmReviewSummary.overallScore * weights.llmReview;
  }

  const score = Math.round(weightedScore * 10) / 10;

  const hasVulnerableProbe =
    input.simulationSummary?.results.some((r) => r.verdict === 'vulnerable') ??
    false;

  const hasFailedDefenseQuality =
    input.llmReviewSummary?.results.some(
      (r) => r.checkId === 'LR-002' && !r.passed,
    ) ?? false;

  const hasCriticalFailure =
    configScore.hasCriticalFailure ||
    hasVulnerableProbe ||
    hasFailedDefenseQuality;

  let grade = scoreToGrade(score);
  if (hasCriticalFailure && gradeRank(grade) < gradeRank('C')) {
    grade = 'C';
  }

  return {
    score,
    grade,
    deploymentRecommendation: gradeToRecommendation(grade),
    hasCriticalFailure,
    totalWeight: configScore.totalWeight,
    passedWeight: configScore.passedWeight,
  };
}

// ── Exported helpers ─────────────────────────────────────────────────────────

export function scoreToGrade(score: number): Grade {
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  if (score >= GRADE_THRESHOLDS.C) return 'C';
  if (score >= GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}

/** Lower rank = better grade. Used for the hard-fail cap comparison. */
export function gradeRank(grade: Grade): number {
  const ranks: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };
  return ranks[grade];
}

export function gradeToRecommendation(grade: Grade): DeploymentRecommendation {
  if (grade === 'A') return 'ready';
  if (grade === 'B' || grade === 'C') return 'needs-fixes';
  return 'not-ready';
}

/**
 * Build sorted recommendations from failed/warned audit results.
 */
export function buildRecommendations(results: AuditResult[]): Recommendation[] {
  const failed = results.filter((r) => !r.passed && r.recommendation);

  const priorityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    critical: 'critical',
    warning: 'high',
    info: 'medium',
  };

  const recommendations: Recommendation[] = failed.map((r) => ({
    priority: priorityMap[r.severity] ?? 'low',
    category: r.ruleId.split('-')[0] || 'General',
    title: `${r.ruleId}: ${r.ruleName}`,
    description: r.message,
    howToFix: r.recommendation!,
    relatedCheckIds: [r.ruleId],
    owaspAsi: r.owaspAsi,
  }));

  // Sort: critical first, then by rule ID
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.relatedCheckIds[0].localeCompare(b.relatedCheckIds[0]);
  });

  return recommendations;
}
