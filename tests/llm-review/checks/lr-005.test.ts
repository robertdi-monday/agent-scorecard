import { describe, it, expect } from 'vitest';
import {
  runTailoredRecommendations,
  extractTailoredFixes,
} from '../../../src/llm-review/checks/lr-005-tailored-recommendations.js';
import { createMockClient } from '../mock-client.js';
import type { AgentConfig, AuditResult } from '../../../src/config/types.js';
import type { LlmReviewResult } from '../../../src/llm-review/types.js';

const baseConfig: AgentConfig = {
  agentId: 'a',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Manage grants',
    plan: 'Track deadlines',
    userPrompt: 'Help me',
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

const failedRule: AuditResult = {
  ruleId: 'SC-001',
  ruleName: 'Injection Defense',
  severity: 'critical',
  passed: false,
  message: 'No injection defenses found.',
  recommendation: 'Add injection defense instructions.',
};

const failedLrResult: LlmReviewResult = {
  checkId: 'LR-002',
  checkName: 'Defense Quality',
  severity: 'critical',
  score: 30,
  passed: false,
  message: 'Defenses are weak.',
  recommendation: 'Strengthen defenses.',
  rawResponse: {},
  evidence: {},
};

describe('LR-005: Tailored Recommendations', () => {
  it('always passes (info severity)', async () => {
    const client = createMockClient();
    const result = await runTailoredRecommendations(
      baseConfig,
      client,
      [failedLrResult],
      [failedRule],
      ['No rate limiting'],
    );
    expect(result.checkId).toBe('LR-005');
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
  });

  it('generates tailored fixes', async () => {
    const client = createMockClient();
    const result = await runTailoredRecommendations(
      baseConfig,
      client,
      [failedLrResult],
      [failedRule],
      [],
    );
    const fixes = result.evidence.fixes;
    expect(Array.isArray(fixes)).toBe(true);
    expect((fixes as unknown[]).length).toBeGreaterThan(0);
  });

  it('returns empty fixes when no issues found', async () => {
    const client = createMockClient();
    const passingResult: LlmReviewResult = {
      ...failedLrResult,
      passed: true,
      score: 90,
    };
    const result = await runTailoredRecommendations(
      baseConfig,
      client,
      [passingResult],
      [],
      [],
    );
    expect(result.message).toContain('No issues');
    expect(result.evidence.fixes).toEqual([]);
  });
});

describe('extractTailoredFixes', () => {
  it('extracts valid fixes with placement normalization', () => {
    const parsed = {
      fixes: [
        {
          related_check: 'SC-001',
          instruction_text: 'Fix this',
          placement: 'prepend',
        },
        {
          related_check: 'SC-002',
          instruction_text: 'Another fix',
          placement: 'invalid',
        },
      ],
    };
    const fixes = extractTailoredFixes(parsed);
    expect(fixes).toHaveLength(2);
    expect(fixes[0].placement).toBe('prepend');
    expect(fixes[1].placement).toBe('append');
  });

  it('filters out fixes with empty instruction text', () => {
    const parsed = {
      fixes: [
        { related_check: 'SC-001', instruction_text: '', placement: 'append' },
      ],
    };
    expect(extractTailoredFixes(parsed)).toHaveLength(0);
  });

  it('handles missing fixes array', () => {
    expect(extractTailoredFixes({})).toEqual([]);
  });
});
