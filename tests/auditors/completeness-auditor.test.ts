import { describe, it, expect } from 'vitest';
import { completenessRules } from '../../src/auditors/completeness-auditor.js';
import type { AgentConfig } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';
import edgeAgent from '../fixtures/edge-case-agent.json';

const [c001, c002, c003, c004, c005, c008] = completenessRules;

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

describe('C-001: Instruction length', () => {
  it('passes with good agent instructions', () => {
    const result = c001.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when instructions are too short', () => {
    // Use a synthetic config — the bad-agent.json fixture exercises many
    // failure modes simultaneously and is no longer below C-001's 200-char
    // floor (it now demonstrates other v2 failures: S-008 secret leak,
    // permission scope, etc).
    const tooShort = makeConfig({
      goal: 'short',
      plan: 'short',
      userPrompt: '',
    });
    const result = c001.check(tooShort);
    expect(result.passed).toBe(false);
  });

  it('passes at exactly 100 characters', () => {
    const config = makeConfig({ plan: 'a'.repeat(100) });
    const result = c001.check(config);
    expect(result.passed).toBe(true);
  });

  it('fails at 99 characters', () => {
    const config = makeConfig({ plan: 'a'.repeat(99) });
    const result = c001.check(config);
    expect(result.passed).toBe(false);
  });

  it('passes at exactly 10000 characters (upper bound is now owned by C-005)', () => {
    const config = makeConfig({ plan: 'a'.repeat(10000) });
    const result = c001.check(config);
    expect(result.passed).toBe(true);
  });

  it('still passes well above the old 10000 ceiling — C-005 owns the upper bound now', () => {
    const config = makeConfig({ plan: 'a'.repeat(20000) });
    const result = c001.check(config);
    expect(result.passed).toBe(true);
  });

  it('carries the Completeness pillar tag', () => {
    expect(c001.pillar).toBe('Completeness');
  });
});

describe('C-002: Error-handling guidance', () => {
  it('passes when error-handling keywords are present', () => {
    const result = c002.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when no error-handling keywords exist', () => {
    const result = c002.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('passes with edge-case agent that mentions tool failure', () => {
    const result = c002.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });
});

describe('C-003: Scope boundary definition', () => {
  it('passes when scope boundary keywords are present', () => {
    const result = c003.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when no scope boundary keywords exist', () => {
    const result = c003.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('fails for edge-case agent without scope boundaries', () => {
    const result = c003.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });
});

describe('C-004: Instruction duplication', () => {
  it('passes for the good fixture', () => {
    const result = c004.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });
});

describe('C-005: Per-section length balance', () => {
  it('flags userPrompt below the 200-char minimum', () => {
    const config = makeConfig({
      goal: 'a'.repeat(120),
      plan: 'b'.repeat(500),
      userPrompt: 'short',
    });
    const result = c005.check(config);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('user_prompt');
  });

  it('passes when each section is within bounds', () => {
    const config = makeConfig({
      goal: 'a'.repeat(120),
      plan: 'b'.repeat(500),
      userPrompt: 'c'.repeat(300),
    });
    const result = c005.check(config);
    expect(result.passed).toBe(true);
  });

  it('flags plan that exceeds 3000 chars', () => {
    const config = makeConfig({
      goal: 'a'.repeat(120),
      plan: 'b'.repeat(3001),
      userPrompt: 'c'.repeat(300),
    });
    const result = c005.check(config);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('plan');
  });
});

describe('C-008: State and kind sanity', () => {
  it('passes for an ACTIVE PERSONAL agent with no notes', () => {
    const config = {
      ...(goodAgent as unknown as AgentConfig),
      kind: 'PERSONAL' as const,
      state: 'ACTIVE' as const,
    };
    const result = c008.check(config);
    expect(result.passed).toBe(true);
  });

  it('fails when state is INACTIVE', () => {
    const config = {
      ...(goodAgent as unknown as AgentConfig),
      state: 'INACTIVE' as const,
    };
    const result = c008.check(config);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('INACTIVE');
  });

  it('passes but emits a kind note for ACCOUNT_LEVEL', () => {
    const config = {
      ...(goodAgent as unknown as AgentConfig),
      kind: 'ACCOUNT_LEVEL' as const,
      state: 'ACTIVE' as const,
    };
    const result = c008.check(config);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('ACCOUNT_LEVEL');
  });

  it('passes but emits a kind note for EXTERNAL', () => {
    const config = {
      ...(goodAgent as unknown as AgentConfig),
      kind: 'EXTERNAL' as const,
      state: 'ACTIVE' as const,
    };
    const result = c008.check(config);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('EXTERNAL');
  });
});
