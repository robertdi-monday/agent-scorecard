import { describe, it, expect } from 'vitest';
import { kbRelevanceCheck } from '../../../src/llm-review/checks/lr-004-kb-relevance.js';
import { createMockClient } from '../mock-client.js';
import type { AgentConfig } from '../../../src/config/types.js';

const baseConfig: AgentConfig = {
  agentId: 'a',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Manage grants',
    plan: 'Track deadlines',
    userPrompt: '',
  },
  knowledgeBase: {
    files: [{ fileName: 'grant-guide.pdf', sourceType: 'file' }],
  },
  tools: [],
  triggers: [],
  permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  skills: [],
};

describe('LR-004: Knowledge Base Relevance', () => {
  it('passes when score >= 60', async () => {
    const client = createMockClient();
    const result = await kbRelevanceCheck.run(baseConfig, client);
    expect(result.checkId).toBe('LR-004');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.severity).toBe('info');
  });

  it('fails when score < 60', async () => {
    const client = createMockClient({
      'LR-004': JSON.stringify({
        relevant: false,
        score: 30,
        file_assessments: [
          { file: 'random.txt', relevant: false, reason: 'Unrelated' },
        ],
        suggested_additions: ['Add grant guidelines'],
        summary: 'KB not relevant.',
      }),
    });
    const result = await kbRelevanceCheck.run(baseConfig, client);
    expect(result.passed).toBe(false);
    expect(result.evidence.suggested_additions).toEqual([
      'Add grant guidelines',
    ]);
  });

  it('returns score 100 with empty KB', async () => {
    const emptyKbConfig = { ...baseConfig, knowledgeBase: { files: [] } };
    const client = createMockClient();
    const result = await kbRelevanceCheck.run(emptyKbConfig, client);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });
});
