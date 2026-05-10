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
  it('runs all 5 checks', async () => {
    const client = createMockClient();
    const summary = await runLlmReview(baseConfig, client);
    expect(summary.checkCount).toBe(5);
    expect(summary.results).toHaveLength(5);
  });

  it('excludes LR-005 from score average', async () => {
    const client = createMockClient();
    const summary = await runLlmReview(baseConfig, client);

    // LR-001=85, LR-002=75, LR-003=90, LR-004=80 → avg = 82.5
    expect(summary.overallScore).toBe(82.5);
  });

  it('extracts tailored fixes from LR-005', async () => {
    const failedRules: AuditResult[] = [
      {
        ruleId: 'SC-001',
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
    expect(summary.tailoredFixes![0].relatedCheck).toBe('SC-001');
  });

  it('isolates individual check failures', async () => {
    const client = createFailingClient();
    const summary = await runLlmReview(baseConfig, client);

    // All phase 1 checks should produce error results, not throw
    expect(summary.checkCount).toBe(5);
    for (const r of summary.results.filter((r) => r.checkId !== 'LR-005')) {
      expect(r.passed).toBe(false);
      expect(r.message).toContain('Check failed');
    }
  });

  it('LR-005 always passes even with errors', async () => {
    const client = createFailingClient();
    const summary = await runLlmReview(baseConfig, client);
    const lr005 = summary.results.find((r) => r.checkId === 'LR-005');
    expect(lr005).toBeDefined();
    expect(lr005!.passed).toBe(true);
  });

  it('produces 0 overallScore when all phase 1 checks fail', async () => {
    const client = createFailingClient();
    const summary = await runLlmReview(baseConfig, client);
    expect(summary.overallScore).toBe(0);
  });
});
