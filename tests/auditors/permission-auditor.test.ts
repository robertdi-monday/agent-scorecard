import { describe, it, expect } from 'vitest';
import { permissionRules } from '../../src/auditors/permission-auditor.js';
import type { AgentConfig } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';

const [pm001, pm002] = permissionRules;

describe('PM-001: Least-privilege permissions', () => {
  it('passes when scope is board-level', () => {
    const result = pm001.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when scope is workspace-wide', () => {
    const result = pm001.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('reports severity as critical', () => {
    const result = pm001.check(badAgent as unknown as AgentConfig);
    expect(result.severity).toBe('critical');
  });

  it('includes OWASP ASI-03 tag', () => {
    const result = pm001.check(badAgent as unknown as AgentConfig);
    expect(result.owaspAsi).toContain('ASI-03');
  });

  it('passes when scope is custom', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      permissions: {
        scopeType: 'custom',
        connectedBoards: ['123'],
        connectedDocs: [],
      },
    };
    const result = pm001.check(config);
    expect(result.passed).toBe(true);
  });
});

describe('PM-002: Child agent permission inheritance', () => {
  it('passes when no parent agent is configured', () => {
    const result = pm002.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('flags for review when parent agent exists', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      permissions: {
        ...(goodAgent as unknown as AgentConfig).permissions,
        parentAgentId: 'parent-123',
      },
    };
    const result = pm002.check(config);
    expect(result.passed).toBe(false);
  });

  it('reports severity as warning', () => {
    const result = pm002.check(goodAgent as unknown as AgentConfig);
    expect(result.severity).toBe('warning');
  });
});
