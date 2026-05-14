/**
 * Regression suite for the composed Scorecard Agent prompt.
 *
 * Why this exists: `buildAgentPrompt()` is the single source of truth for what
 * we ship to the live monday agent via `provision-agent.ts`. It composes from
 * dozens of per-rule snippets. A careless edit to a rule snippet, or
 * absent-mindedly adding a 17th LR check, can balloon the prompt past
 * monday's `user_prompt` field cap and break provisioning silently in CI.
 *
 * These tests pin:
 *   1. A hard upper bound (29 000 chars / ~8 700 tokens) — well below monday's
 *      30 000-char field cap, with headroom for focused-output templates.
 *   2. A reasonable lower bound — guards against accidentally rebuilding from
 *      an empty rule registry (e.g. tree-shaking dropping every check).
 *   3. The exported AGENT_USER_PROMPT is byte-identical to a fresh
 *      buildAgentPrompt() call (no stale snapshot drift).
 *   4. Every pillar and every v1 rule is represented in the output.
 *   5. The header / scoring / board-output / error-handling blocks are present.
 */
import { describe, it, expect } from 'vitest';
import {
  buildAgentPrompt,
  INCLUDE_DEMO_NARRATIVE_SCOPE,
} from '../../src/agent-builder/build-agent-prompt.js';
import { AGENT_USER_PROMPT } from '../../src/agent-builder/agent-prompt.js';
import { getRulesForVertical } from '../../src/auditors/runner.js';

describe('buildAgentPrompt — size regression', () => {
  const prompt = buildAgentPrompt();

  it('stays under 29 000 chars (monday user_prompt soft ceiling, ~8.7k tokens)', () => {
    expect(prompt.length).toBeLessThanOrEqual(29_000);
  });

  it('is at least 10 000 chars — guards against an empty/broken rule registry', () => {
    expect(prompt.length).toBeGreaterThanOrEqual(10_000);
  });

  it('exported AGENT_USER_PROMPT equals a fresh buildAgentPrompt() call', () => {
    expect(AGENT_USER_PROMPT).toBe(prompt);
  });
});

describe('buildAgentPrompt — content invariants', () => {
  const prompt = buildAgentPrompt();

  it('includes a section header for every pillar', () => {
    const pillarDisplayNames: Record<string, string> = {
      Completeness: 'Completeness',
      Safety: 'Trust',
      Quality: 'Quality',
      Observability: 'Observability',
      Reliability: 'Reliability',
    };
    for (const [, displayName] of Object.entries(pillarDisplayNames)) {
      expect(prompt).toContain(`#### Pillar: ${displayName}`);
    }
  });

  it('mentions every v1 rule id (rule.pillar !== undefined)', () => {
    const v1 = getRulesForVertical().filter((r) => r.pillar !== undefined);
    expect(v1.length).toBeGreaterThan(0);
    for (const rule of v1) {
      expect(prompt, `expected ${rule.id} to appear in agent prompt`).toContain(
        rule.id,
      );
    }
  });

  it('includes the canonical scaffolding blocks', () => {
    expect(prompt).toContain('## IDENTITY AND SECURITY');
    expect(prompt).toContain(
      '### Step 1: Identify and Retrieve the Target Agent',
    );
    expect(prompt).toContain('### Step 2: Run Pillar Checks');
    expect(prompt).toContain('### Step 3: Scoring');
    expect(prompt).toContain('### Step 4: Results delivery (chat-only)');
    expect(prompt).toContain('## ERROR HANDLING');
    expect(prompt).toContain('## OUTPUT BEHAVIOR');
    expect(prompt).toContain('Block-on-critical (v2)');
  });

  it('includes focused narrative OUTPUT BEHAVIOR when INCLUDE_DEMO_NARRATIVE_SCOPE is true', () => {
    if (INCLUDE_DEMO_NARRATIVE_SCOPE) {
      expect(prompt).toContain(
        '## OUTPUT BEHAVIOR (focused narrative — token efficiency & data integrity)',
      );
    } else {
      expect(prompt).not.toContain(
        '## OUTPUT BEHAVIOR (focused narrative — token efficiency & data integrity)',
      );
    }
  });

  it('includes the Q-004 tailored-fixes snippet (always-pass info check)', () => {
    expect(prompt).toContain('Q-004 — Tailored Fixes');
  });

  it('lists full-mode-only rules under EXCLUDED CHECKS', () => {
    const fullModeOnly = getRulesForVertical().filter(
      (r) => r.pillar === undefined,
    );
    if (fullModeOnly.length === 0) {
      // No full-mode-only rules → block is omitted, that's fine.
      return;
    }
    expect(prompt).toContain('## EXCLUDED CHECKS');
    for (const rule of fullModeOnly) {
      expect(prompt).toContain(rule.id);
    }
  });
});
