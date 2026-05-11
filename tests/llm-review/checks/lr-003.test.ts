import { describe, it, expect } from 'vitest';
import { toolGoalAlignmentCheck } from '../../../src/llm-review/checks/lr-003-tool-goal-alignment.js';
import { createMockClient } from '../mock-client.js';
import type { AgentConfig } from '../../../src/config/types.js';

const baseConfig: AgentConfig = {
  agentId: 'a',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Manage projects',
    plan: 'Track tasks',
    userPrompt: '',
  },
  knowledgeBase: { files: [] },
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

describe('Q-003: Plan-Goal Alignment', () => {
  it('passes when score >= 70', async () => {
    const client = createMockClient();
    const result = await toolGoalAlignmentCheck.run(baseConfig, client);
    expect(result.checkId).toBe('Q-003');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(90);
    expect(result.owaspAsi).toContain('ASI-02');
  });

  it('fails when score < 70', async () => {
    const client = createMockClient({
      'Q-003': JSON.stringify({
        aligned: false,
        score: 40,
        tool_assessments: [
          { tool: 'email', relevant: false, reason: 'Not needed' },
        ],
        unnecessary_tools: ['email'],
        missing_capabilities: [],
        summary: 'Misaligned.',
      }),
    });
    const result = await toolGoalAlignmentCheck.run(baseConfig, client);
    expect(result.passed).toBe(false);
    expect(result.evidence.unnecessary_tools).toEqual(['email']);
  });

  it('handles no tools gracefully', async () => {
    const noToolsConfig = { ...baseConfig, tools: [] };
    const client = createMockClient();
    const result = await toolGoalAlignmentCheck.run(noToolsConfig, client);
    expect(result.checkId).toBe('Q-003');
  });
});
