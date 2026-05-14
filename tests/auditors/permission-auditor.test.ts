import { describe, it, expect } from 'vitest';
import { permissionRules } from '../../src/auditors/permission-auditor.js';
import type { AgentConfig, AuditContext } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';
import childAgent from '../fixtures/child-agent.json';

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

  it('includes privilege-risk tag (ASI-03) on metadata', () => {
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

  it('passes as info when parent agent exists but no parent config provided', () => {
    const config = childAgent as unknown as AgentConfig;
    const result = pm002.check(config);
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.message).toContain('manual review');
  });

  it('passes when parent config provided and child scope does not exceed parent', () => {
    const config = childAgent as unknown as AgentConfig;
    const parent: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      permissions: {
        scopeType: 'board',
        connectedBoards: ['11111', '22222'],
        connectedDocs: [],
      },
    };
    const context: AuditContext = { parentConfig: parent };
    const result = pm002.check(config, context);
    expect(result.passed).toBe(true);
  });

  it('fails when child has broader scope than parent', () => {
    const config: AgentConfig = {
      ...(childAgent as unknown as AgentConfig),
      permissions: {
        ...(childAgent as unknown as AgentConfig).permissions,
        scopeType: 'workspace',
      },
    };
    const parent = goodAgent as unknown as AgentConfig;
    const context: AuditContext = { parentConfig: parent };
    const result = pm002.check(config, context);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('broader');
  });

  it('fails when child has boards not in parent', () => {
    const config: AgentConfig = {
      ...(childAgent as unknown as AgentConfig),
      permissions: {
        ...(childAgent as unknown as AgentConfig).permissions,
        connectedBoards: ['11111', '99999'],
      },
    };
    const parent = goodAgent as unknown as AgentConfig;
    const context: AuditContext = { parentConfig: parent };
    const result = pm002.check(config, context);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('99999');
  });

  it('reports severity as warning', () => {
    const result = pm002.check(goodAgent as unknown as AgentConfig);
    expect(result.severity).toBe('warning');
  });
});
