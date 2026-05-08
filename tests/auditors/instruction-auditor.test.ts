import { describe, it, expect } from 'vitest';
import { instructionRules } from '../../src/auditors/instruction-auditor.js';
import type { AgentConfig } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';
import edgeAgent from '../fixtures/edge-case-agent.json';

const [in001, in002, in003, in004] = instructionRules;

function makeConfig(overrides: {
  goal?: string;
  plan?: string;
  userPrompt?: string;
}): AgentConfig {
  return {
    ...(goodAgent as unknown as AgentConfig),
    instructions: {
      goal: overrides.goal ?? '',
      plan: overrides.plan ?? '',
      userPrompt: overrides.userPrompt ?? '',
    },
  };
}

describe('IN-001: Instruction length', () => {
  it('passes with good agent instructions', () => {
    const result = in001.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when instructions are too short', () => {
    const result = in001.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('passes at exactly 100 characters', () => {
    const config = makeConfig({ plan: 'a'.repeat(100) });
    const result = in001.check(config);
    expect(result.passed).toBe(true);
  });

  it('fails at 99 characters', () => {
    const config = makeConfig({ plan: 'a'.repeat(99) });
    const result = in001.check(config);
    expect(result.passed).toBe(false);
  });

  it('passes at exactly 10000 characters', () => {
    const config = makeConfig({ plan: 'a'.repeat(10000) });
    const result = in001.check(config);
    expect(result.passed).toBe(true);
  });

  it('fails at 10001 characters', () => {
    const config = makeConfig({ plan: 'a'.repeat(10001) });
    const result = in001.check(config);
    expect(result.passed).toBe(false);
  });
});

describe('IN-002: Guardrail presence', () => {
  it('passes when guardrail keywords are present', () => {
    const result = in002.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when no guardrail keywords exist', () => {
    const result = in002.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('reports severity as critical', () => {
    const result = in002.check(badAgent as unknown as AgentConfig);
    expect(result.severity).toBe('critical');
  });

  it('passes when at least one guardrail keyword is present', () => {
    const config = makeConfig({
      plan: 'This is a plan. Never fabricate any data. Follow the rules.',
    });
    const result = in002.check(config);
    expect(result.passed).toBe(true);
  });
});

describe('IN-003: Error-handling guidance', () => {
  it('passes when error-handling keywords are present', () => {
    const result = in003.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when no error-handling keywords exist', () => {
    const result = in003.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('passes with edge-case agent that mentions tool failure', () => {
    const result = in003.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });
});

describe('IN-004: Scope boundary definition', () => {
  it('passes when scope boundary keywords are present', () => {
    const result = in004.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when no scope boundary keywords exist', () => {
    const result = in004.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('fails for edge-case agent without scope boundaries', () => {
    const result = in004.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });
});
