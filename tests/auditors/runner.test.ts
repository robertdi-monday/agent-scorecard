import { describe, it, expect } from 'vitest';
import { getRulesForVertical, runAudit } from '../../src/auditors/runner.js';
import type { AgentConfig } from '../../src/config/types.js';

/** Stable inventory — 24 universal + 4 SLED when vertical set */
const BASE_RULE_IDS = [
  'KB-001',
  'KB-002',
  'KB-003',
  'PM-001',
  'PM-002',
  'TL-001',
  'TL-002',
  'TR-001',
  'TR-002',
  'IN-001',
  'IN-002',
  'IN-003',
  'IN-004',
  'EF-001',
  'EF-002',
  'EF-003',
  'EF-004',
  'EF-005',
  'SC-001',
  'SC-002',
  'SC-003',
  'SC-004',
  'SC-005',
  'SC-006',
].sort();

const SLED_RULE_IDS = ['SLED-001', 'SLED-002', 'SLED-003', 'SLED-004'].sort();

const minimalAgent = (): AgentConfig => ({
  agentId: 'test-agent',
  agentName: 'Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'x'.repeat(120),
    plan: 'y'.repeat(120),
    userPrompt: '',
  },
  knowledgeBase: { files: [] },
  tools: [],
  triggers: [],
  permissions: {
    scopeType: 'board',
    connectedBoards: [],
    connectedDocs: [],
  },
  skills: [],
});

describe('getRulesForVertical', () => {
  it('returns 24 base rules with no vertical', () => {
    const rules = getRulesForVertical();
    expect(rules).toHaveLength(24);
    const ids = rules.map((r) => r.id).sort();
    expect(ids).toEqual(BASE_RULE_IDS);
  });

  it('returns same base rules for undefined as for unknown vertical', () => {
    const a = getRulesForVertical(undefined)
      .map((r) => r.id)
      .sort();
    const b = getRulesForVertical('unknown-vertical')
      .map((r) => r.id)
      .sort();
    expect(a).toEqual(b);
    expect(a).toEqual(BASE_RULE_IDS);
  });

  it('adds SLED pack for sled-grant', () => {
    const rules = getRulesForVertical('sled-grant');
    expect(rules).toHaveLength(28);
    const ids = rules.map((r) => r.id).sort();
    expect(ids).toEqual([...BASE_RULE_IDS, ...SLED_RULE_IDS].sort());
  });
});

describe('runAudit', () => {
  it('returns one result per applicable rule', () => {
    const cfg = minimalAgent();
    expect(runAudit(cfg)).toHaveLength(24);
    expect(runAudit(cfg, 'sled-grant')).toHaveLength(28);
  });

  it('passes audit context through to rules', () => {
    const cfg = {
      ...minimalAgent(),
      permissions: {
        scopeType: 'board' as const,
        connectedBoards: ['111'],
        connectedDocs: [],
        parentAgentId: 'parent-1',
      },
    };
    const parent = minimalAgent();
    parent.permissions = {
      scopeType: 'workspace',
      connectedBoards: ['111', '222'],
      connectedDocs: [],
    };
    const results = runAudit(cfg, undefined, { parentConfig: parent });
    const pm002 = results.find((r) => r.ruleId === 'PM-002');
    expect(pm002).toBeDefined();
    expect(pm002!.passed).toBe(true);
  });
});

describe('AuditRule contract', () => {
  it('each check returns ruleId matching rule.id and a boolean passed flag', () => {
    const cfg = minimalAgent();
    for (const rule of getRulesForVertical('sled-grant')) {
      const result = rule.check(cfg);
      expect(result.ruleId).toBe(rule.id);
      expect(result.severity).toBe(rule.severity);
      expect(typeof result.passed).toBe('boolean');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
