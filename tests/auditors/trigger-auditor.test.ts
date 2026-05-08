import { describe, it, expect } from 'vitest';
import { triggerRules } from '../../src/auditors/trigger-auditor.js';
import type { AgentConfig } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';
import edgeAgent from '../fixtures/edge-case-agent.json';

const [tr001, tr002] = triggerRules;

describe('TR-001: Self-trigger loop detection', () => {
  it('passes when trigger type is not column_change', () => {
    const result = tr001.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when column_change trigger overlaps with tool modifiesColumns', () => {
    const result = tr001.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('reports severity as critical', () => {
    const result = tr001.check(badAgent as unknown as AgentConfig);
    expect(result.severity).toBe('critical');
  });

  it('passes when no triggers exist', () => {
    const result = tr001.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('passes when column_change trigger exists but no tool has modifiesColumns', () => {
    const config: AgentConfig = {
      ...(badAgent as unknown as AgentConfig),
      tools: [
        {
          name: 'some-tool',
          displayName: 'Some Tool',
          type: 'builtin',
          connectionStatus: 'ready',
          enabled: true,
        },
      ],
    };
    const result = tr001.check(config);
    expect(result.passed).toBe(true);
  });

  it('passes when column_change trigger fires on a different column than tools modify', () => {
    const config: AgentConfig = {
      ...(badAgent as unknown as AgentConfig),
      triggers: [
        {
          name: 'When Priority changes',
          blockReferenceId: '14849232',
          triggerType: 'column_change',
          triggerConfig: { boardId: '99999', columnId: 'priority' },
        },
      ],
    };
    const result = tr001.check(config);
    expect(result.passed).toBe(true);
  });
});

describe('TR-002: Trigger-purpose alignment', () => {
  it('passes when trigger name aligns with agent goal', () => {
    const result = tr002.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('passes when no triggers exist', () => {
    const result = tr002.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('warns when trigger name has no overlap with instructions', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      instructions: {
        goal: 'Track sales pipeline',
        plan: 'Monitor deals and revenue forecasts.',
        userPrompt: '',
      },
      triggers: [
        {
          name: 'Xylophone polarity flips',
          blockReferenceId: '999',
          triggerType: 'column_change',
          triggerConfig: {},
        },
      ],
    };
    const result = tr002.check(config);
    expect(result.passed).toBe(false);
  });
});
