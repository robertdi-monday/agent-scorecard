import { describe, it, expect } from 'vitest';
import { toolRules } from '../../src/auditors/tool-auditor.js';
import type { AgentConfig } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';
import edgeAgent from '../fixtures/edge-case-agent.json';

const [tl001, tl002] = toolRules;

describe('TL-001: Tool necessity', () => {
  it('passes when all tools are relevant', () => {
    const result = tl001.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('passes when no tools are enabled', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      tools: [],
    };
    const result = tl001.check(config);
    expect(result.passed).toBe(true);
  });

  it('matches unnecessary tools via displayName when name differs', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      instructions: {
        goal: 'Data retrieval and lookup from connected boards',
        plan: 'Read-only reporting',
        userPrompt: '',
      },
      tools: [
        {
          name: 'custom-integration-xyz',
          displayName: 'Tavily Web Search',
          type: 'custom',
          connectionStatus: 'connected',
          enabled: true,
        },
      ],
    };
    const result = tl001.check(config);
    expect(result.passed).toBe(false);
    expect((result.evidence?.flaggedTools as string[]).join(',')).toMatch(
      /Tavily/i,
    );
  });

  it('flags unnecessary web-search tool for a data retrieval agent', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      instructions: {
        goal: 'Data retrieval and lookup from connected boards',
        plan: 'Search board items and return results',
        userPrompt: '',
      },
      tools: [
        {
          name: 'tavily-web-search',
          displayName: 'Tavily Web Search',
          type: 'custom',
          connectionStatus: 'connected',
          enabled: true,
        },
      ],
    };
    const result = tl001.check(config);
    expect(result.passed).toBe(false);
  });

  it('does not flag disabled tools', () => {
    const result = tl001.check(edgeAgent as unknown as AgentConfig);
    // Edge case has chart-generator disabled, so only monday-read-only is checked
    expect(result.passed).toBe(true);
  });
});

describe('TL-002: Tool connection status', () => {
  it('passes when all enabled tools are connected', () => {
    const result = tl002.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when an enabled tool is not connected', () => {
    const result = tl002.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('reports severity as critical', () => {
    const result = tl002.check(badAgent as unknown as AgentConfig);
    expect(result.severity).toBe('critical');
  });

  it('passes when no tools are enabled', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      tools: [],
    };
    const result = tl002.check(config);
    expect(result.passed).toBe(true);
  });

  it('ignores disabled tools with not_connected status', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      tools: [
        {
          name: 'broken-tool',
          displayName: 'Broken Tool',
          type: 'custom',
          connectionStatus: 'not_connected',
          enabled: false,
        },
      ],
    };
    const result = tl002.check(config);
    expect(result.passed).toBe(true);
  });
});
