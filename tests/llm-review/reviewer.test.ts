import { describe, it, expect } from 'vitest';
import { runLlmReview } from '../../src/llm-review/reviewer.js';
import { createMockClient, createFailingClient } from './mock-client.js';
import type { AgentConfig, AuditResult } from '../../src/config/types.js';

const baseConfig: AgentConfig = {
  agentId: 'a',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Manage grants',
    plan: 'Track deadlines. Never fabricate data.',
    userPrompt: 'Help me',
  },
  knowledgeBase: {
    files: [{ fileName: 'guide.pdf', sourceType: 'file' }],
  },
  tools: [
    {
      name: 'monday-read',
      displayName: 'Monday Read',
      type: 'builtin',
      connectionStatus: 'connected',
      enabled: true,
    },
  ],
  triggers: [],
  permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  skills: [],
};

describe('runLlmReview', () => {
  it('runs all 10 checks (9 phase-1 + Q-004)', async () => {
    const client = createMockClient();
    const summary = await runLlmReview(baseConfig, client);
    expect(summary.checkCount).toBe(10);
    expect(summary.results).toHaveLength(10);
  });

  it('excludes Q-004 from score average', async () => {
    const client = createMockClient();
    const summary = await runLlmReview(baseConfig, client);

    // Phase-1 scores (in registration order):
    //   Q-002=85, S-003=75, Q-003=90, LR-004=80,
    //   S-004=85, S-005=80, S-007=75, S-009=80, C-007=70
    // Sum = 720, mean = 80.0
    expect(summary.overallScore).toBe(80);
  });

  it('extracts tailored fixes from Q-004', async () => {
    const failedRules: AuditResult[] = [
      {
        ruleId: 'S-002',
        ruleName: 'Injection Defense',
        severity: 'critical',
        passed: false,
        message: 'No injection defenses.',
        recommendation: 'Add them.',
      },
    ];
    const client = createMockClient();
    const summary = await runLlmReview(baseConfig, client, failedRules, [
      'No rate limiting',
    ]);
    expect(summary.tailoredFixes).toBeDefined();
    expect(summary.tailoredFixes!.length).toBeGreaterThan(0);
    expect(summary.tailoredFixes![0].relatedCheck).toBe('S-002');
  });

  it('isolates individual check failures', async () => {
    const client = createFailingClient();
    const summary = await runLlmReview(baseConfig, client);

    // All 9 phase-1 checks should produce error results, not throw (+ Q-004 = 10 total).
    expect(summary.checkCount).toBe(10);
    for (const r of summary.results.filter((r) => r.checkId !== 'Q-004')) {
      expect(r.passed).toBe(false);
      expect(r.message).toContain('Check failed');
    }
  });

  it('Q-004 always passes even with errors', async () => {
    const client = createFailingClient();
    const summary = await runLlmReview(baseConfig, client);
    const q004 = summary.results.find((r) => r.checkId === 'Q-004');
    expect(q004).toBeDefined();
    expect(q004!.passed).toBe(true);
  });

  it('produces 0 overallScore when all phase 1 checks fail', async () => {
    const client = createFailingClient();
    const summary = await runLlmReview(baseConfig, client);
    expect(summary.overallScore).toBe(0);
  });
});
