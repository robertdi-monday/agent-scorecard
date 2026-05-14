import { describe, it, expect } from 'vitest';
import { refusalConcretenessCheck } from '../../../src/llm-review/checks/lr-008-refusal-concreteness.js';
import { createMockClient, createMalformedClient } from '../mock-client.js';
import type { AgentConfig } from '../../../src/config/types.js';

const baseConfig: AgentConfig = {
  agentId: 'a',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Screen grant applicants for eligibility.',
    plan: 'If a date is missing, refuse to fabricate one and notify the user.',
    userPrompt: '',
  },
  knowledgeBase: { files: [] },
  tools: [],
  triggers: [],
  permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  skills: [],
};

describe('S-007: Refusal Triggers Concrete (LR-008)', () => {
  it('Safety pillar + agent prompt snippet present', () => {
    expect(refusalConcretenessCheck.pillar).toBe('Safety');
    expect(refusalConcretenessCheck.agentPromptSnippet).toContain('S-007');
  });

  it('warning severity with injection-theme risk tag on metadata', () => {
    expect(refusalConcretenessCheck.severity).toBe('warning');
    expect(refusalConcretenessCheck.owaspAsi).toContain('ASI-01');
  });

  it('passes at default mock score 75 and surfaces concrete triggers', async () => {
    const client = createMockClient();
    const result = await refusalConcretenessCheck.run(baseConfig, client);
    expect(result.checkId).toBe('S-007');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(75);
    expect(Array.isArray(result.evidence.triggers)).toBe(true);
    const triggers = result.evidence.triggers as Array<{ concrete: boolean }>;
    expect(triggers[0].concrete).toBe(true);
  });

  it('fails when triggers are vague — surfaces missing_scenarios in evidence', async () => {
    const client = createMockClient({
      'S-007': JSON.stringify({
        score: 40,
        triggers: [
          {
            scenario: 'unsure',
            response: 'escalate',
            concrete: false,
          },
        ],
        missing_scenarios: ['missing data', 'out-of-scope request'],
        summary: 'Refusal protocol is generic.',
      }),
    });
    const result = await refusalConcretenessCheck.run(baseConfig, client);
    expect(result.passed).toBe(false);
    expect(result.evidence.missing_scenarios).toEqual([
      'missing data',
      'out-of-scope request',
    ]);
    expect(result.recommendation).toContain('refusal triggers');
  });

  it('rejects on malformed JSON (reviewer wraps to score=0)', async () => {
    await expect(
      refusalConcretenessCheck.run(baseConfig, createMalformedClient()),
    ).rejects.toThrow();
  });
});
