/**
 * GOV-001 — Autonomy-tier inference. Derives a tier 1-4 from the agent's
 * `kind` plus a coarse "capability surface" signal extracted from the plan
 * text. Higher tiers face stricter grade thresholds in `aggregator.ts` so
 * an EXTERNAL agent must score >= 90 for `ready`, while a PERSONAL agent
 * with narrow surface only needs >= 75.
 *
 * The capability-surface signal is intentionally heuristic and uses the same
 * deterministic regex/keyword approach as the rest of the v1 pipeline. An
 * LLM-inferred surface call is reserved for v2 when the live agent can run
 * a single LR-011 capability-surface review.
 */

import type { AgentConfig, AutonomyTier, Grade } from '../config/types.js';
import { TIER_AWARE_READY_THRESHOLDS } from '../config/constants.js';
import { matchKeyword } from '../auditors/auditor-utils.js';

/** Phrases that signal a broad capability surface in the plan/user_prompt. */
const BROAD_SURFACE_KEYWORDS = [
  'send email',
  'send emails',
  'webhook',
  'external api',
  'http request',
  'fetch url',
  'web search',
  'browse the web',
  'scrape',
  'execute',
  'run command',
  'shell',
  'delete',
  'overwrite',
  'transfer',
  'wire',
  'payment',
  'money',
  'invoice',
  'across all boards',
  'entire workspace',
  'every board',
  'every user',
  'across the workspace',
  'organization-wide',
];

/** Phrases that indicate narrow scope. */
const NARROW_SURFACE_KEYWORDS = [
  'read-only',
  'read only',
  'analysis only',
  'reporting only',
  'dashboard only',
  'lookup only',
  'only operate on',
  'restricted to',
  'limited to a single',
];

/**
 * Count whole-word/whole-phrase matches. Uses `matchKeyword` (the same
 * boundary-anchored helper the v1 rules use) so a plan containing
 * "we will never send any email" no longer counts toward broad surface —
 * the bare substring "send email" is rejected unless it appears as a
 * standalone phrase boundary.
 */
function countMatches(text: string, keywords: string[]): number {
  return keywords.filter((kw) => matchKeyword(text, kw)).length;
}

function classifySurface(plan: string): 'narrow' | 'moderate' | 'broad' {
  const broad = countMatches(plan, BROAD_SURFACE_KEYWORDS);
  const narrow = countMatches(plan, NARROW_SURFACE_KEYWORDS);
  if (broad >= 3) return 'broad';
  if (broad >= 1 && narrow === 0) return 'broad';
  if (narrow >= 2) return 'narrow';
  if (narrow >= 1 && broad === 0) return 'narrow';
  return 'moderate';
}

export interface AutonomyTierInference {
  tier: AutonomyTier;
  rationale: string;
  signals: {
    kind: AgentConfig['kind'];
    surface: 'narrow' | 'moderate' | 'broad';
  };
}

/**
 * Infer the autonomy tier from kind + plan-text capability surface.
 * Pure function — deterministic, no I/O.
 */
export function inferAutonomyTier(config: AgentConfig): AutonomyTierInference {
  const planText = `${config.instructions.plan || ''}\n${config.instructions.userPrompt || ''}`;
  const surface = classifySurface(planText);

  let tier: AutonomyTier;
  let rationale: string;

  if (config.kind === 'EXTERNAL') {
    tier = 4;
    rationale = `EXTERNAL agents are always Tier 4 — output is consumed by systems outside the workspace, broad blast radius regardless of plan text.`;
  } else if (config.kind === 'ACCOUNT_LEVEL') {
    if (surface === 'broad') {
      tier = 4;
      rationale = `ACCOUNT_LEVEL with broad capability surface (multiple destructive / external-facing keywords in plan).`;
    } else if (surface === 'narrow') {
      tier = 2;
      rationale = `ACCOUNT_LEVEL but explicitly narrow scope (read-only / restricted-to language in plan).`;
    } else {
      tier = 3;
      rationale = `ACCOUNT_LEVEL with moderate capability surface (default).`;
    }
  } else {
    if (surface === 'broad') {
      tier = 2;
      rationale = `PERSONAL but plan describes broad capabilities; broader blast radius than typical PERSONAL.`;
    } else {
      tier = 1;
      rationale = `PERSONAL with narrow or moderate scope — lowest blast radius.`;
    }
  }

  return {
    tier,
    rationale,
    signals: {
      kind: config.kind,
      surface,
    },
  };
}

/**
 * Tier-aware grade for `ready` determination. Returns the new
 * deploymentRecommendation given a tier and a raw grade.
 *
 * Score ranges (as configured in TIER_AWARE_READY_THRESHOLDS):
 *   Tier 1: ready >= 75 (B+)
 *   Tier 2: ready >= 80 (B/B+)
 *   Tier 3: ready >= 85 (B+/A-)
 *   Tier 4: ready >= 90 (A only)
 */
export function tierAwareReady(
  tier: AutonomyTier,
  score: number,
  baseGrade: Grade,
): { ready: boolean; reason?: string } {
  // Block-on-critical (F) is non-overridable.
  if (baseGrade === 'F') return { ready: false, reason: 'block-on-critical' };

  const threshold = TIER_AWARE_READY_THRESHOLDS[tier];
  if (score >= threshold) return { ready: true };
  return {
    ready: false,
    reason: `Tier ${tier} requires score >= ${threshold} for 'ready' (current score: ${score}).`,
  };
}
