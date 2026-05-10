import { describe, it, expect } from 'vitest';
import {
  getInstructionText,
  findKeywords,
  jaccardSimilarity,
} from '../../src/helpers/text-analysis.js';
import type { AgentConfig } from '../../src/config/types.js';

const makeConfig = (
  goal: string,
  plan: string,
  userPrompt: string,
): AgentConfig =>
  ({
    agentId: 'test',
    agentName: 'Test',
    kind: 'PERSONAL',
    state: 'ACTIVE',
    instructions: { goal, plan, userPrompt },
    knowledgeBase: { files: [] },
    tools: [],
    triggers: [],
    permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
    skills: [],
  }) as AgentConfig;

describe('getInstructionText', () => {
  it('combines goal, plan, and userPrompt with spaces', () => {
    const config = makeConfig('Do X', 'Step by step', 'Please help');
    expect(getInstructionText(config)).toBe('Do X Step by step Please help');
  });

  it('filters out empty strings', () => {
    const config = makeConfig('Goal here', '', 'Prompt here');
    expect(getInstructionText(config)).toBe('Goal here Prompt here');
  });

  it('returns empty string if all parts are empty', () => {
    const config = makeConfig('', '', '');
    // goal and plan are required non-empty in schema, but function handles it
    expect(getInstructionText(config)).toBe('');
  });
});

describe('findKeywords', () => {
  it('matches case-insensitively', () => {
    const result = findKeywords('Never Fabricate data', ['never fabricate']);
    expect(result).toEqual(['never fabricate']);
  });

  it('returns all matching keywords', () => {
    const text = 'Do not guess. Escalate if unsure. Ask for clarification.';
    const result = findKeywords(text, [
      'do not guess',
      'escalate if unsure',
      'ask for clarification',
      'never fabricate',
    ]);
    expect(result).toHaveLength(3);
    expect(result).not.toContain('never fabricate');
  });

  it('returns empty array when nothing matches', () => {
    expect(findKeywords('Hello world', ['foo', 'bar'])).toEqual([]);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(jaccardSimilarity('alpha beta', 'gamma delta')).toBe(0);
  });

  it('returns 0 for two empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(0);
  });

  it('computes correct similarity for partial overlap', () => {
    // "hello world" → {hello, world}
    // "hello earth" → {hello, earth}
    // intersection = {hello}, union = {hello, world, earth}
    // similarity = 1/3
    const sim = jaccardSimilarity('hello world', 'hello earth');
    expect(sim).toBeCloseTo(1 / 3, 5);
  });

  it('is case-insensitive', () => {
    expect(jaccardSimilarity('Hello World', 'hello world')).toBe(1);
  });
});
