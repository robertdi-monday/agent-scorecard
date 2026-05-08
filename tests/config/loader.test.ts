import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, ConfigLoadError } from '../../src/config/loader.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-scorecard-loader-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

const minimalValidJson = () =>
  JSON.stringify({
    agentId: 'id-1',
    agentName: 'Agent',
    kind: 'PERSONAL',
    state: 'ACTIVE',
    instructions: { goal: 'goal text here', plan: 'plan text here' },
    knowledgeBase: { files: [] },
    tools: [],
    triggers: [],
    permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  });

describe('loadConfig', () => {
  it('loads a minimal valid config', () => {
    const path = writeConfig('ok.json', minimalValidJson());
    const cfg = loadConfig(path);
    expect(cfg.agentId).toBe('id-1');
    expect(cfg.skills).toEqual([]);
    expect(cfg.instructions.userPrompt).toBe('');
  });

  it('preserves userPrompt and skills when provided', () => {
    const path = writeConfig(
      'full.json',
      JSON.stringify({
        ...JSON.parse(minimalValidJson()),
        instructions: {
          goal: 'g',
          plan: 'p',
          userPrompt: 'hello',
        },
        skills: [{ id: '1', name: 's', description: 'd' }],
      }),
    );
    const cfg = loadConfig(path);
    expect(cfg.instructions.userPrompt).toBe('hello');
    expect(cfg.skills).toHaveLength(1);
  });

  it('throws ConfigLoadError when file is missing', () => {
    expect(() => loadConfig(join(dir, 'nope.json'))).toThrow(ConfigLoadError);
    expect(() => loadConfig(join(dir, 'nope.json'))).toThrow(
      /read config file/,
    );
  });

  it('throws when JSON is invalid', () => {
    const path = writeConfig('bad.json', '{ not json');
    expect(() => loadConfig(path)).toThrow(ConfigLoadError);
    expect(() => loadConfig(path)).toThrow(/valid JSON/);
  });

  it('throws when root is not an object', () => {
    expect(() => loadConfig(writeConfig('a.json', '[]'))).toThrow(
      /JSON object/,
    );
    expect(() => loadConfig(writeConfig('b.json', 'null'))).toThrow(
      /JSON object/,
    );
  });

  it('throws when agentId is missing or empty', () => {
    const base = JSON.parse(minimalValidJson());
    delete base.agentId;
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/agentId/);
    base.agentId = '   ';
    expect(() =>
      loadConfig(writeConfig('2.json', JSON.stringify(base))),
    ).toThrow(/agentId/);
  });

  it('throws when agentName is missing or empty', () => {
    const base = JSON.parse(minimalValidJson());
    delete base.agentName;
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/agentName/);
  });

  it('throws when instructions is missing or not an object', () => {
    const base = JSON.parse(minimalValidJson());
    delete base.instructions;
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/instructions/);
    base.instructions = [];
    expect(() =>
      loadConfig(writeConfig('2.json', JSON.stringify(base))),
    ).toThrow(/instructions/);
  });

  it('throws when instructions.goal or plan is missing', () => {
    const base = JSON.parse(minimalValidJson());
    base.instructions = { goal: 'x', plan: '' };
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/plan/);
    base.instructions = { goal: '', plan: 'y' };
    expect(() =>
      loadConfig(writeConfig('2.json', JSON.stringify(base))),
    ).toThrow(/goal/);
  });

  it('throws when knowledgeBase.files is not an array', () => {
    const base = JSON.parse(minimalValidJson());
    base.knowledgeBase = { files: {} };
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/files/);
  });

  it('throws when tools or triggers is not an array', () => {
    const base = JSON.parse(minimalValidJson());
    base.tools = {};
    expect(() =>
      loadConfig(writeConfig('t.json', JSON.stringify(base))),
    ).toThrow(/tools/);
    base.tools = [];
    base.triggers = {};
    expect(() =>
      loadConfig(writeConfig('tr.json', JSON.stringify(base))),
    ).toThrow(/triggers/);
  });

  it('throws when permissions is missing or not an object', () => {
    const base = JSON.parse(minimalValidJson());
    delete base.permissions;
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/permissions/);
    base.permissions = [];
    expect(() =>
      loadConfig(writeConfig('2.json', JSON.stringify(base))),
    ).toThrow(/permissions/);
  });

  it('defaults userPrompt when omitted', () => {
    const path = writeConfig('def.json', minimalValidJson());
    const cfg = loadConfig(path);
    expect(cfg.instructions.userPrompt).toBe('');
  });

  it('throws when kind is missing or invalid', () => {
    const base = JSON.parse(minimalValidJson());
    delete base.kind;
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/kind/);
    base.kind = 'INVALID';
    expect(() =>
      loadConfig(writeConfig('2.json', JSON.stringify(base))),
    ).toThrow(/kind/);
  });

  it('throws when state is missing or invalid', () => {
    const base = JSON.parse(minimalValidJson());
    base.state = 'UNKNOWN';
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/state/);
  });

  it('throws when tool type or connectionStatus is invalid', () => {
    const base = JSON.parse(minimalValidJson());
    base.tools = [
      {
        name: 't',
        displayName: 'T',
        type: 'invalid',
        connectionStatus: 'ready',
        enabled: true,
      },
    ];
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/type/);
    base.tools[0].type = 'builtin';
    base.tools[0].connectionStatus = 'broken';
    expect(() =>
      loadConfig(writeConfig('2.json', JSON.stringify(base))),
    ).toThrow(/connectionStatus/);
  });

  it('throws when trigger is malformed', () => {
    const base = JSON.parse(minimalValidJson());
    base.triggers = [
      { name: '', blockReferenceId: 'b', triggerType: 't', triggerConfig: {} },
    ];
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/triggers\[0\]\.name/);
    base.triggers = [
      {
        name: 'n',
        blockReferenceId: 'b',
        triggerType: 't',
        triggerConfig: null,
      },
    ];
    expect(() =>
      loadConfig(writeConfig('2.json', JSON.stringify(base))),
    ).toThrow(/triggerConfig/);
  });

  it('throws when permissions.scopeType is invalid', () => {
    const base = JSON.parse(minimalValidJson());
    base.permissions = {
      scopeType: 'global',
      connectedBoards: [],
      connectedDocs: [],
    };
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/scopeType/);
  });

  it('throws when connectedBoards has non-string entries', () => {
    const base = JSON.parse(minimalValidJson());
    base.permissions = {
      scopeType: 'board',
      connectedBoards: [123],
      connectedDocs: [],
    };
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/connectedBoards/);
  });

  it('throws when knowledgeBase file missing sourceType', () => {
    const base = JSON.parse(minimalValidJson());
    base.knowledgeBase = { files: [{ fileName: 'f.pdf' }] };
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/sourceType/);
  });

  it('validates skills entries when present', () => {
    const base = JSON.parse(minimalValidJson());
    base.skills = [{ id: '1', name: '', description: 'x' }];
    expect(() =>
      loadConfig(writeConfig('1.json', JSON.stringify(base))),
    ).toThrow(/skills\[0\]\.name/);
  });
});
