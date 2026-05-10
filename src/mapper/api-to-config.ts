import type { AgentConfig } from '../config/types.js';
import type { InternalAgentResponse } from './api-types.js';

export function mapApiResponseToConfig(
  raw: InternalAgentResponse,
): AgentConfig {
  return {
    agentId: String(raw.appFeatureId),
    agentName: raw.profile.name,
    kind: normalizeKind(raw.kind),
    state: normalizeState(raw.state),
    instructions: {
      goal: raw.goal || '',
      plan: raw.plan || '',
      userPrompt: raw.userPrompt || '',
    },
    tools: [
      ...raw.tools.map((t) => ({
        name: `tool-${t.blockReferenceId}`,
        displayName: `tool-${t.blockReferenceId}`,
        type: 'builtin' as const,
        enabled: t.enabled,
        connectionStatus: 'connected' as const,
      })),
      ...(raw.mcpTools || []).map((t) => ({
        name: t.mcpServer,
        displayName: t.displayName,
        type: 'mcp' as const,
        enabled: t.enabled,
        connectionStatus: 'connected' as const,
      })),
    ],
    knowledgeBase: {
      files: (raw.knowledge || []).map((k) => ({
        fileName: k.fileName,
        sourceType: k.fileType || 'file',
        lastUpdated: undefined,
      })),
    },
    permissions: inferPermissions(raw.scopePermissions || []),
    triggers: (raw.triggers || []).map((t) => ({
      name: t.triggerId,
      blockReferenceId: t.triggerId,
      triggerType: t.triggerType,
      triggerConfig: t.fieldSelections || {},
    })),
    skills: (raw.skills || []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
  };
}

function inferPermissions(
  scopes: InternalAgentResponse['scopePermissions'],
): AgentConfig['permissions'] {
  const hasWorkspace = scopes.some((s) => s.scopeType === 'workspace');
  const boards = scopes
    .filter((s) => s.boardId != null)
    .map((s) => String(s.boardId));
  const docs = scopes
    .filter((s) => s.docId != null)
    .map((s) => String(s.docId));

  return {
    scopeType: hasWorkspace
      ? 'workspace'
      : boards.length > 0
        ? 'board'
        : 'custom',
    connectedBoards: boards,
    connectedDocs: docs,
  };
}

const VALID_KINDS = new Set(['PERSONAL', 'ACCOUNT_LEVEL', 'EXTERNAL']);
function normalizeKind(kind: string): AgentConfig['kind'] {
  const upper = kind.toUpperCase();
  if (VALID_KINDS.has(upper)) return upper as AgentConfig['kind'];
  return 'PERSONAL';
}

const VALID_STATES = new Set([
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED',
  'DELETED',
  'FAILED',
]);
function normalizeState(state: string): AgentConfig['state'] {
  const upper = state.toUpperCase();
  if (VALID_STATES.has(upper)) return upper as AgentConfig['state'];
  return 'ACTIVE';
}
