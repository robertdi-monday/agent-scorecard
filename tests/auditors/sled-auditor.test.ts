import { describe, it, expect } from 'vitest';
import { sledRules } from '../../src/auditors/sled-auditor.js';
import type { AgentConfig } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';

const [sled001, sled002, sled003, sled004] = sledRules;

describe('SLED-001: Deadline accuracy instructions', () => {
  it('passes when deadline keywords are present', () => {
    const result = sled001.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when no deadline keywords exist', () => {
    const result = sled001.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('reports severity as critical', () => {
    const result = sled001.check(badAgent as unknown as AgentConfig);
    expect(result.severity).toBe('critical');
  });
});

describe('SLED-002: Financial no-fabrication rule', () => {
  it('passes when both fabrication and financial keywords are present', () => {
    const result = sled002.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when neither fabrication nor financial keywords exist', () => {
    const result = sled002.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('fails when only financial keywords exist without no-fabrication rule', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      instructions: {
        goal: 'Handle grant funding and budget allocations',
        plan: 'Track grant amounts and funding. Report budget status.',
        userPrompt: '',
      },
    };
    const result = sled002.check(config);
    expect(result.passed).toBe(false);
  });
});

describe('SLED-003: Eligibility knowledge files', () => {
  it('passes when eligibility-related files exist', () => {
    const result = sled003.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when knowledge base is empty', () => {
    const result = sled003.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('fails when files exist but none are eligibility-related', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      knowledgeBase: {
        files: [
          { fileName: 'meeting-notes.txt', sourceType: 'file' },
          { fileName: 'logo.png', sourceType: 'file' },
        ],
      },
    };
    const result = sled003.check(config);
    expect(result.passed).toBe(false);
  });
});

describe('SLED-004: Compliance term references', () => {
  it('passes when compliance terms are present in instructions', () => {
    const result = sled004.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when no compliance terms exist', () => {
    const result = sled004.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });
});
