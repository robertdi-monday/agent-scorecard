import { describe, it, expect } from 'vitest';
import { goalSpecificityCheck } from '../../../src/llm-review/checks/lr-010-goal-specificity.js';
import { createMockClient, createMalformedClient } from '../mock-client.js';
import type { AgentConfig } from '../../../src/config/types.js';

const baseConfig: AgentConfig = {
  agentId: 'a',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Manage Pell grants for Title IV applicants.',
    plan: '',
    userPrompt: '',
  },
  knowledgeBase: { files: [] },
  tools: [],
  triggers: [],
  permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  skills: [],
};

describe('C-007: Goal Specificity (LR-010)', () => {
  it('Completeness pillar + agent prompt snippet present', () => {
    expect(goalSpecificityCheck.pillar).toBe('Completeness');
    expect(goalSpecificityCheck.agentPromptSnippet).toContain('C-007');
  });

  it('warning severity (no OWASP tag — goal quality is not a security risk on its own)', () => {
    expect(goalSpecificityCheck.severity).toBe('warning');
  });

  it('passes at score 70 (default mock) — surfaces three-axis breakdown', async () => {
    const client = createMockClient();
    const result = await goalSpecificityCheck.run(baseConfig, client);
    expect(result.checkId).toBe('C-007');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    const axes = result.evidence.axes as Record<string, number>;
    expect(typeof axes.domain).toBe('number');
    expect(typeof axes.outcome).toBe('number');
    expect(typeof axes.scope).toBe('number');
  });

  it('fails when goal is vague — recommendation includes improved_goal_example', async () => {
    const client = createMockClient({
      'C-007': JSON.stringify({
        score: 30,
        axes: { domain: 30, outcome: 30, scope: 30 },
        weaknesses: ['No domain', 'No measurable outcome', 'No scope'],
        improved_goal_example:
          'Screen Pell-grant applicants for Title IV eligibility against 2026 KB; produce per-applicant PASS/FAIL.',
        summary: 'Goal is too vague.',
      }),
    });
    const result = await goalSpecificityCheck.run(baseConfig, client);
    expect(result.passed).toBe(false);
    expect(result.recommendation).toContain('Title IV');
    expect(result.evidence.improved_goal_example).toContain('PASS/FAIL');
  });

  it('rejects on malformed JSON (reviewer wraps to score=0)', async () => {
    await expect(
      goalSpecificityCheck.run(baseConfig, createMalformedClient()),
    ).rejects.toThrow();
  });
});
