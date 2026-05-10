import { describe, it, expect } from 'vitest';
import { runAudit } from '../../src/auditors/runner.js';
import type { AgentConfig } from '../../src/config/types.js';

const base = (): AgentConfig => ({
  agentId: 'eff-test',
  agentName: 'Efficiency Test',
  kind: 'PERSONAL',
  state: 'ACTIVE',
  instructions: {
    goal: 'Help users manage projects efficiently with clear procedures.',
    plan: 'Follow structured procedures. Never fabricate. Report the error if fails.',
    userPrompt: '',
  },
  knowledgeBase: { files: [] },
  tools: [],
  triggers: [],
  permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  skills: [],
});

function getResult(config: AgentConfig, ruleId: string) {
  const results = runAudit(config);
  return results.find((r) => r.ruleId === ruleId)!;
}

describe('EF-001: Instruction duplication', () => {
  it('passes when no duplicated segments', () => {
    const config = base();
    config.instructions.plan =
      'Step one: gather data. Step two: analyze results. Step three: present findings. Never fabricate. Report the error if fails.';
    expect(getResult(config, 'EF-001').passed).toBe(true);
  });

  it('fails when 2+ highly similar segments exist', () => {
    const config = base();
    const repeatedA =
      'Always verify all data before proceeding with the next step in the workflow';
    const repeatedB =
      'Check all credentials and permissions before executing any destructive operations';
    config.instructions.goal = `${repeatedA}. ${repeatedB}. Something unique goes here.`;
    config.instructions.plan = `${repeatedA}. ${repeatedB}. Another totally different sentence.`;
    config.instructions.userPrompt = '';
    const result = getResult(config, 'EF-001');
    expect(result.passed).toBe(false);
    expect(result.evidence?.duplicatedSegments).toBeDefined();
  });
});

describe('EF-002: Tool count ratio', () => {
  it('passes with few tools', () => {
    const config = base();
    config.tools = [
      {
        name: 'tool-1',
        displayName: 'T1',
        type: 'builtin',
        connectionStatus: 'ready',
        enabled: true,
      },
    ];
    expect(getResult(config, 'EF-002').passed).toBe(true);
  });

  it('fails with >10 tools and short instructions', () => {
    const config = base();
    config.instructions = { goal: 'Help', plan: 'Do stuff', userPrompt: '' };
    config.tools = Array.from({ length: 12 }, (_, i) => ({
      name: `tool-${i}`,
      displayName: `Tool ${i}`,
      type: 'builtin' as const,
      connectionStatus: 'ready' as const,
      enabled: true,
    }));
    const result = getResult(config, 'EF-002');
    expect(result.passed).toBe(false);
    expect(result.message).toContain('12 tools enabled');
  });

  it('passes with >10 tools but long instructions', () => {
    const config = base();
    config.instructions.plan =
      'x'.repeat(500) + ' never fabricate. report the error.';
    config.tools = Array.from({ length: 12 }, (_, i) => ({
      name: `tool-${i}`,
      displayName: `Tool ${i}`,
      type: 'builtin' as const,
      connectionStatus: 'ready' as const,
      enabled: true,
    }));
    expect(getResult(config, 'EF-002').passed).toBe(true);
  });
});

describe('EF-003: Circular skill dependencies', () => {
  it('passes with no skills', () => {
    expect(getResult(base(), 'EF-003').passed).toBe(true);
  });

  it('passes with non-circular skills', () => {
    const config = base();
    config.skills = [
      { id: 's1', name: 'Skill Alpha', description: 'Does alpha things' },
      { id: 's2', name: 'Skill Beta', description: 'Does beta things' },
    ];
    expect(getResult(config, 'EF-003').passed).toBe(true);
  });

  it('fails when skills reference each other', () => {
    const config = base();
    config.skills = [
      {
        id: 's1',
        name: 'Skill Alpha',
        description: 'Delegates complex tasks to Skill Beta',
      },
      {
        id: 's2',
        name: 'Skill Beta',
        description: 'Falls back to Skill Alpha for edge cases',
      },
    ];
    const result = getResult(config, 'EF-003');
    expect(result.passed).toBe(false);
    expect(result.evidence?.circularPairs).toHaveLength(1);
  });
});

describe('EF-004: Prompt bloat detection', () => {
  it('passes with dense instructions', () => {
    const config = base();
    config.instructions.plan =
      'Track deadlines. Verify eligibility. Flag discrepancies. Never fabricate data. Report errors immediately. Validate output.';
    expect(getResult(config, 'EF-004').passed).toBe(true);
  });

  it('fails with extremely filler-heavy text', () => {
    const config = base();
    // Mostly stop words
    config.instructions.plan =
      'the the the the the the the the the the is is is is is is are are are are was was was was were were with with from from and and and and';
    config.instructions.goal =
      'the the the the the the the the the the is is is is is is are are are are was was was was were were with with from from and and and and';
    const result = getResult(config, 'EF-004');
    expect(result.passed).toBe(false);
    expect(result.message).toContain('density is low');
  });
});

describe('EF-005: KB file relevance overlap', () => {
  it('passes with distinct file names', () => {
    const config = base();
    config.knowledgeBase.files = [
      { fileName: 'grant-guidelines.pdf', sourceType: 'file' },
      { fileName: 'compliance-checklist.docx', sourceType: 'file' },
    ];
    expect(getResult(config, 'EF-005').passed).toBe(true);
  });

  it('fails with highly similar file names', () => {
    const config = base();
    // 10-word base, 1 differing word → Jaccard = 10/12 = 0.83 > 0.8
    config.knowledgeBase.files = [
      {
        fileName:
          'Federal Grant Program Eligibility Guidelines for State Local Education Agencies Draft.pdf',
        sourceType: 'file',
      },
      {
        fileName:
          'Federal Grant Program Eligibility Guidelines for State Local Education Agencies Final.pdf',
        sourceType: 'file',
      },
    ];
    const result = getResult(config, 'EF-005');
    expect(result.passed).toBe(false);
    expect(
      (result.evidence?.overlappingPairs as unknown[]).length,
    ).toBeGreaterThan(0);
  });

  it('passes with empty KB', () => {
    expect(getResult(base(), 'EF-005').passed).toBe(true);
  });
});
