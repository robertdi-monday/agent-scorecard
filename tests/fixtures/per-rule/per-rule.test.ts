/**
 * Per-rule fixture sweep.
 *
 * Each new universal rule has a `<rule-id>-pass.json` and `<rule-id>-fail.json`
 * minimal AgentConfig fixture. This suite loads them, runs the rule against
 * the fixture, and asserts the expected pass/fail status. Catches regressions
 * when keyword lists are tweaked or the surface classifier is rewritten —
 * exactly the case the parent fixtures (good-agent, bad-agent) miss because
 * they exercise dozens of rules at once.
 *
 * Naming convention:
 *   - Deterministic rule "X-NNN" → fixtures/per-rule/x-nnn-{pass,fail}.json
 *   - LLM rule "X-NNN" (LR-*) → same fixtures but the harness invokes the LR
 *     check with a mock client whose JSON response matches the fixture intent
 *     (high score for pass, low score for fail).
 *   - GOV-001 → fixtures/per-rule/gov001-tier{1,2,3,4}.json with expected tier.
 */
import { describe, it, expect } from 'vitest';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { runAudit } from '../../../src/auditors/runner.js';
import { inferAutonomyTier } from '../../../src/scoring/autonomy-tier.js';
import { goalSpecificityCheck } from '../../../src/llm-review/checks/lr-010-goal-specificity.js';
import { createMockClient } from '../../llm-review/mock-client.js';
import type { AgentConfig, AutonomyTier } from '../../../src/config/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function load(name: string): AgentConfig {
  return JSON.parse(
    readFileSync(resolve(__dirname, name), 'utf-8'),
  ) as AgentConfig;
}

/**
 * Map of `<rule-id>` → expected status when running the fixture's deterministic
 * pair. Both `-pass.json` and `-fail.json` must exist for each entry.
 */
const DETERMINISTIC_RULES: Record<string, string> = {
  'C-005': 'c005',
  'C-008': 'c008',
  'S-006': 's006',
  'S-008': 's008',
  'O-001': 'o001',
  'O-002': 'o002',
  'R-001': 'r001',
  'R-002': 'r002',
};

describe('per-rule fixture sweep — deterministic rules', () => {
  for (const [ruleId, prefix] of Object.entries(DETERMINISTIC_RULES)) {
    describe(ruleId, () => {
      it(`${ruleId} passes on ${prefix}-pass.json`, () => {
        const cfg = load(`${prefix}-pass.json`);
        const results = runAudit(cfg);
        const target = results.find((r) => r.ruleId === ruleId);
        expect(target, `${ruleId} not present in audit results`).toBeDefined();
        expect(
          target!.passed,
          `${ruleId} expected PASS on ${prefix}-pass.json — got: ${target!.message}`,
        ).toBe(true);
      });

      it(`${ruleId} fails on ${prefix}-fail.json`, () => {
        const cfg = load(`${prefix}-fail.json`);
        const results = runAudit(cfg);
        const target = results.find((r) => r.ruleId === ruleId);
        expect(target, `${ruleId} not present in audit results`).toBeDefined();
        expect(
          target!.passed,
          `${ruleId} expected FAIL on ${prefix}-fail.json — got: ${target!.message}`,
        ).toBe(false);
      });
    });
  }
});

describe('per-rule fixture sweep — LLM rule C-007 (LR-010)', () => {
  it('passes on c007-pass.json with a high-specificity mock judgment', async () => {
    const cfg = load('c007-pass.json');
    const client = createMockClient({
      'C-007': JSON.stringify({
        score: 85,
        axes: { domain: 90, outcome: 85, scope: 80 },
        weaknesses: [],
        improved_goal_example: '',
        summary: 'Goal is specific along all three axes.',
      }),
    });
    const result = await goalSpecificityCheck.run(cfg, client);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('fails on c007-fail.json with a low-specificity mock judgment', async () => {
    const cfg = load('c007-fail.json');
    const client = createMockClient({
      'C-007': JSON.stringify({
        score: 25,
        axes: { domain: 25, outcome: 25, scope: 25 },
        weaknesses: ['No domain', 'No measurable outcome', 'No scope'],
        improved_goal_example:
          'Screen Pell-grant applicants for Title IV eligibility…',
        summary: 'Goal is too vague.',
      }),
    });
    const result = await goalSpecificityCheck.run(cfg, client);
    expect(result.passed).toBe(false);
    expect(result.recommendation).toBeDefined();
  });
});

describe('per-rule fixture sweep — GOV-001 autonomy tier', () => {
  const expectedTiers: Array<{ file: string; tier: AutonomyTier }> = [
    { file: 'gov001-tier1.json', tier: 1 },
    { file: 'gov001-tier2.json', tier: 2 },
    { file: 'gov001-tier3.json', tier: 3 },
    { file: 'gov001-tier4.json', tier: 4 },
  ];

  for (const { file, tier } of expectedTiers) {
    it(`${file} infers Tier ${tier}`, () => {
      const cfg = load(file);
      const inference = inferAutonomyTier(cfg);
      expect(
        inference.tier,
        `${file} expected Tier ${tier} — got ${inference.tier} (${inference.rationale})`,
      ).toBe(tier);
    });
  }
});
