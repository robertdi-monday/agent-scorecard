import { describe, it, expect } from 'vitest';
import { instructionCoherenceCheck } from '../../../src/llm-review/checks/lr-001-instruction-coherence.js';
import { createMockClient, createFailingClient } from '../mock-client.js';
import type { AgentConfig } from '../../../src/config/types.js';

const baseConfig: AgentConfig = {
  agentId: 'a',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Manage grant applications',
    plan: 'Track deadlines and screen eligibility',
    userPrompt: 'Help me with grants',
  },
  knowledgeBase: { files: [] },
  tools: [],
  triggers: [],
  permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  skills: [],
};

describe('LR-001: Instruction Coherence', () => {
  it('passes when score >= 70', async () => {
    const client = createMockClient();
    const result = await instructionCoherenceCheck.run(baseConfig, client);
    expect(result.checkId).toBe('LR-001');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(85);
    expect(result.severity).toBe('warning');
  });

  it('fails when score < 70', async () => {
    const client = createMockClient({
      'LR-001': JSON.stringify({
        coherent: false,
        score: 40,
        issues: ['Goal contradicts plan'],
        summary: 'Incoherent.',
      }),
    });
    const result = await instructionCoherenceCheck.run(baseConfig, client);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(40);
    expect(result.recommendation).toBeDefined();
  });

  it('includes goal, plan, and userPrompt in prompt', async () => {
    const calls: string[] = [];
    const client = {
      async complete(prompt: string) {
        calls.push(prompt);
        return JSON.stringify({
          coherent: true,
          score: 80,
          issues: [],
          summary: 'ok',
        });
      },
    };
    await instructionCoherenceCheck.run(baseConfig, client);
    expect(calls[0]).toContain('Manage grant applications');
    expect(calls[0]).toContain('Track deadlines');
    expect(calls[0]).toContain('Help me with grants');
  });

  it('handles empty instructions gracefully', async () => {
    const emptyConfig = {
      ...baseConfig,
      instructions: { goal: '', plan: '', userPrompt: '' },
    };
    const client = createMockClient();
    const result = await instructionCoherenceCheck.run(emptyConfig, client);
    expect(result.checkId).toBe('LR-001');
  });
});
