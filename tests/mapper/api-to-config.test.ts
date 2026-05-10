import { describe, it, expect } from 'vitest';
import { mapApiResponseToConfig } from '../../src/mapper/api-to-config.js';
import type { InternalAgentResponse } from '../../src/mapper/api-types.js';

function makeFullResponse(
  overrides: Partial<InternalAgentResponse> = {},
): InternalAgentResponse {
  return {
    id: 35543,
    appFeatureId: 20555889,
    kind: 'PERSONAL',
    state: 'active',
    goal: 'Help with project management',
    plan: 'Assist users with task tracking.',
    userPrompt: 'Manage my board',
    profile: { name: 'PM Agent', avatarUrl: 'https://example.com/avatar.png' },
    tools: [
      { blockReferenceId: 101, enabled: true },
      { blockReferenceId: 202, enabled: false },
    ],
    mcpTools: [
      {
        kind: 'mcp',
        enabled: true,
        mcpServer: 'github-mcp',
        description: 'GitHub integration',
        displayName: 'GitHub MCP',
      },
    ],
    knowledge: [
      { id: 'k1', fileName: 'guide.pdf', fileType: 'pdf', fileSize: 1024 },
    ],
    scopePermissions: [{ scopeType: 'board', boardId: 12345 }],
    skills: [
      { id: 's1', name: 'Task Tracker', description: 'Tracks tasks on board' },
    ],
    members: [{ userId: 1, role: 'admin' }],
    triggers: [
      {
        triggerId: 'trig-1',
        triggerType: 'item_created',
        fieldSelections: { boardId: '12345' },
      },
    ],
    ...overrides,
  };
}

describe('mapApiResponseToConfig', () => {
  it('maps a full API response to AgentConfig', () => {
    const config = mapApiResponseToConfig(makeFullResponse());

    expect(config.agentId).toBe('20555889');
    expect(config.agentName).toBe('PM Agent');
    expect(config.kind).toBe('PERSONAL');
    expect(config.state).toBe('ACTIVE');
    expect(config.instructions.goal).toBe('Help with project management');
    expect(config.instructions.plan).toBe(
      'Assist users with task tracking.',
    );
    expect(config.instructions.userPrompt).toBe('Manage my board');
  });

  it('merges builtin tools and MCP tools into unified tools array', () => {
    const config = mapApiResponseToConfig(makeFullResponse());

    expect(config.tools).toHaveLength(3);

    expect(config.tools[0].name).toBe('tool-101');
    expect(config.tools[0].type).toBe('builtin');
    expect(config.tools[0].enabled).toBe(true);

    expect(config.tools[1].name).toBe('tool-202');
    expect(config.tools[1].type).toBe('builtin');
    expect(config.tools[1].enabled).toBe(false);

    expect(config.tools[2].name).toBe('github-mcp');
    expect(config.tools[2].displayName).toBe('GitHub MCP');
    expect(config.tools[2].type).toBe('mcp');
    expect(config.tools[2].enabled).toBe(true);
  });

  it('maps knowledge files correctly', () => {
    const config = mapApiResponseToConfig(makeFullResponse());

    expect(config.knowledgeBase.files).toHaveLength(1);
    expect(config.knowledgeBase.files[0].fileName).toBe('guide.pdf');
    expect(config.knowledgeBase.files[0].sourceType).toBe('pdf');
  });

  it('defaults sourceType to "file" when fileType is missing', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({
        knowledge: [{ id: 'k1', fileName: 'notes.txt' }],
      }),
    );

    expect(config.knowledgeBase.files[0].sourceType).toBe('file');
  });

  it('infers board-scoped permissions from scopePermissions', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({
        scopePermissions: [
          { scopeType: 'board', boardId: 100 },
          { scopeType: 'board', boardId: 200 },
        ],
      }),
    );

    expect(config.permissions.scopeType).toBe('board');
    expect(config.permissions.connectedBoards).toEqual(['100', '200']);
    expect(config.permissions.connectedDocs).toEqual([]);
  });

  it('infers workspace-scoped permissions when any scope is workspace', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({
        scopePermissions: [
          { scopeType: 'workspace' },
          { scopeType: 'board', boardId: 100 },
        ],
      }),
    );

    expect(config.permissions.scopeType).toBe('workspace');
    expect(config.permissions.connectedBoards).toEqual(['100']);
  });

  it('infers custom scope when no boards and no workspace', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({
        scopePermissions: [{ scopeType: 'doc', docId: 999 }],
      }),
    );

    expect(config.permissions.scopeType).toBe('custom');
    expect(config.permissions.connectedDocs).toEqual(['999']);
  });

  it('maps triggers correctly', () => {
    const config = mapApiResponseToConfig(makeFullResponse());

    expect(config.triggers).toHaveLength(1);
    expect(config.triggers[0].triggerType).toBe('item_created');
    expect(config.triggers[0].triggerConfig).toEqual({ boardId: '12345' });
  });

  it('maps skills correctly', () => {
    const config = mapApiResponseToConfig(makeFullResponse());

    expect(config.skills).toHaveLength(1);
    expect(config.skills[0].name).toBe('Task Tracker');
  });

  it('handles empty arrays gracefully', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({
        tools: [],
        mcpTools: [],
        knowledge: [],
        scopePermissions: [],
        skills: [],
        members: [],
        triggers: [],
      }),
    );

    expect(config.tools).toEqual([]);
    expect(config.knowledgeBase.files).toEqual([]);
    expect(config.permissions.scopeType).toBe('custom');
    expect(config.permissions.connectedBoards).toEqual([]);
    expect(config.triggers).toEqual([]);
    expect(config.skills).toEqual([]);
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: InternalAgentResponse = {
      id: 1,
      appFeatureId: 2,
      kind: 'PERSONAL',
      state: 'active',
      goal: 'test',
      plan: 'test plan',
      userPrompt: '',
      profile: { name: 'Minimal Agent' },
      tools: [],
      mcpTools: [],
      knowledge: [],
      scopePermissions: [],
      skills: [],
      members: [],
    };

    const config = mapApiResponseToConfig(minimal);
    expect(config.agentId).toBe('2');
    expect(config.agentName).toBe('Minimal Agent');
    expect(config.triggers).toEqual([]);
  });

  it('normalizes kind to uppercase', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({ kind: 'account_level' }),
    );
    expect(config.kind).toBe('ACCOUNT_LEVEL');
  });

  it('normalizes state to uppercase', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({ state: 'active' }),
    );
    expect(config.state).toBe('ACTIVE');
  });

  it('defaults unknown kind to PERSONAL', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({ kind: 'UNKNOWN_KIND' }),
    );
    expect(config.kind).toBe('PERSONAL');
  });

  it('defaults unknown state to ACTIVE', () => {
    const config = mapApiResponseToConfig(
      makeFullResponse({ state: 'bogus' }),
    );
    expect(config.state).toBe('ACTIVE');
  });
});
