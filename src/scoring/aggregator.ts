import type {
  AuditResult,
  DeploymentRecommendation,
  Grade,
  Pillar,
  PillarScore,
  Recommendation,
  ScorecardScore,
} from '../config/types.js';
import type { SimulationSummary } from '../simulation/types.js';
import type { LlmReviewSummary } from '../llm-review/types.js';
import { SEVERITY_WEIGHTS, GRADE_THRESHOLDS } from '../config/constants.js';

/**
 * Calculate the overall score from audit results using severity-weighted scoring.
 *
 * - Weights (Phase 0.3): critical=10, warning=3, info=1
 * - Score = (sum of passed weights / sum of all weights) × 100
 * - **Block-on-critical**: any failed critical rule forces grade=F and
 *   deploymentRecommendation='not-ready', regardless of raw score. The previous
 *   "cap-at-C" behavior is too lenient — a single broken safety rail must
 *   prevent deployment, not just downgrade it.
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

  // Block-on-critical: any failed critical rule → F / not-ready.
  if (hasCriticalFailure) {
    grade = 'F';
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
 *   - Failed S-003 (Defense Effectiveness, critical severity)
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
      (r) => r.checkId === 'S-003' && !r.passed,
    ) ?? false;

  const hasCriticalFailure =
    configScore.hasCriticalFailure ||
    hasVulnerableProbe ||
    hasFailedDefenseQuality;

  let grade = scoreToGrade(score);
  if (hasCriticalFailure) {
    grade = 'F';
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

// ── Pillar scores ────────────────────────────────────────────────────────────

const PILLAR_NAMES: readonly Pillar[] = [
  'Completeness',
  'Safety',
  'Quality',
  'Observability',
  'Reliability',
] as const;

/** Map a ruleId prefix to its pillar (used as a fallback when a result has no
 * `pillar` set — e.g. synthetic results promoted from the LLM review summary). */
const PREFIX_TO_PILLAR: Record<string, Pillar> = {
  C: 'Completeness',
  S: 'Safety',
  Q: 'Quality',
  O: 'Observability',
  R: 'Reliability',
};

function pillarFor(result: {
  pillar?: Pillar;
  ruleId: string;
}): Pillar | undefined {
  if (result.pillar) return result.pillar;
  const prefix = result.ruleId.split('-')[0]?.charAt(0);
  return prefix ? PREFIX_TO_PILLAR[prefix] : undefined;
}

/**
 * Calculate per-pillar scores from audit results (and optionally LLM review).
 *
 * Bucketing prefers the explicit `result.pillar` field (set by the runner from
 * `AuditRule.pillar`); falls back to the rule-ID prefix for older results or
 * synthetic results promoted from the LLM review summary.
 */
export function calculatePillarScores(
  configResults: AuditResult[],
  llmReviewSummary?: LlmReviewSummary,
): PillarScore[] {
  const buckets: Record<Pillar, AuditResult[]> = {
    Completeness: [],
    Safety: [],
    Quality: [],
    Observability: [],
    Reliability: [],
  };

  for (const r of configResults) {
    const p = pillarFor(r);
    if (p) buckets[p].push(r);
  }

  if (llmReviewSummary) {
    for (const r of llmReviewSummary.results) {
      const synthetic: AuditResult = {
        ruleId: r.checkId,
        ruleName: r.checkName,
        severity: r.severity,
        passed: r.passed,
        message: r.message,
        recommendation: r.recommendation,
        owaspAsi: r.owaspAsi,
      };
      const p = pillarFor(synthetic);
      if (p) buckets[p].push(synthetic);
    }
  }

  return PILLAR_NAMES.map((pillar) => {
    const results = buckets[pillar];
    if (results.length === 0) {
      return { pillar, score: 100, passed: 0, failed: 0, total: 0 };
    }
    let totalWeight = 0;
    let passedWeight = 0;
    let passed = 0;
    let failed = 0;
    for (const r of results) {
      const w = SEVERITY_WEIGHTS[r.severity];
      totalWeight += w;
      if (r.passed) {
        passedWeight += w;
        passed++;
      } else {
        failed++;
      }
    }
    const score =
      totalWeight > 0
        ? Math.round((passedWeight / totalWeight) * 1000) / 10
        : 100;
    return { pillar, score, passed, failed, total: results.length };
  });
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

const RULE_PREFIX_TO_CATEGORY: Record<string, string> = {
  C: 'Completeness',
  S: 'Safety',
  Q: 'Quality',
  O: 'Observability',
  R: 'Reliability',
  GOV: 'Governance',
};

function ruleIdToCategory(ruleId: string): string {
  const prefix = ruleId.split('-')[0];
  return RULE_PREFIX_TO_CATEGORY[prefix] ?? (prefix || 'General');
}

const PRIORITY_MAP: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  critical: 'critical',
  warning: 'high',
  info: 'medium',
};

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function sortRecommendations(recs: Recommendation[]): Recommendation[] {
  return recs.sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.relatedCheckIds[0].localeCompare(b.relatedCheckIds[0]);
  });
}

/**
 * Build sorted recommendations from failed/warned audit results.
 */
export function buildRecommendations(results: AuditResult[]): Recommendation[] {
  const failed = results.filter((r) => !r.passed && r.recommendation);

  const recommendations: Recommendation[] = failed.map((r) => ({
    priority: PRIORITY_MAP[r.severity] ?? 'low',
    category: ruleIdToCategory(r.ruleId),
    title: `${r.ruleId}: ${r.ruleName}`,
    description: r.message,
    howToFix: r.recommendation!,
    relatedCheckIds: [r.ruleId],
    owaspAsi: r.owaspAsi,
  }));

  return sortRecommendations(recommendations);
}

/**
 * Build recommendations from all layers: config audit + LLM review.
 * LLM tailored fixes override generic recommendations for the same check.
 */
export function buildAllRecommendations(
  configResults: AuditResult[],
  llmReviewSummary?: LlmReviewSummary,
): Recommendation[] {
  const recs = buildRecommendations(configResults);

  if (!llmReviewSummary) return recs;

  const failedLlm = llmReviewSummary.results.filter(
    (r) => !r.passed && r.recommendation,
  );
  for (const r of failedLlm) {
    recs.push({
      priority: PRIORITY_MAP[r.severity] ?? 'low',
      category: ruleIdToCategory(r.checkId),
      title: `${r.checkId}: ${r.checkName}`,
      description: r.message,
      howToFix: r.recommendation!,
      relatedCheckIds: [r.checkId],
      owaspAsi: r.owaspAsi,
    });
  }

  // Tailored fixes from Q-004 override generic howToFix for their related check
  if (llmReviewSummary.tailoredFixes) {
    for (const fix of llmReviewSummary.tailoredFixes) {
      const target = recs.find((r) =>
        r.relatedCheckIds.includes(fix.relatedCheck),
      );
      if (target) {
        target.howToFix = fix.instructionText;
      }
    }
  }

  return sortRecommendations(recs);
}
