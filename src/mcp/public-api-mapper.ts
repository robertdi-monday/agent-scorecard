/**
 * Maps the public get_agent API response to an AgentConfig.
 *
 * The public API only returns instruction-level fields (goal, plan, user_prompt,
 * kind, state, profile). Tools, KB, permissions, triggers, and skills are NOT
 * available and default to empty values.
 */

import type { AgentConfig } from '../config/types.js';
import type { PublicAgentResponse } from './monday-api.js';

/** Rule IDs that only need instruction text and can be evaluated with public API data. */
export const INSTRUCTION_ONLY_RULE_IDS = new Set([
  'IN-001',
  'IN-002',
  'IN-003',
  'IN-004',
  'EF-001',
  'EF-004',
  'SC-001',
]);

export function mapPublicAgentToConfig(raw: PublicAgentResponse): AgentConfig {
  return {
    agentId: String(raw.id),
    agentName: raw.profile.name,
    kind: normalizeKind(raw.kind),
    state: normalizeState(raw.state),
    instructions: {
      goal: raw.goal || '',
      plan: raw.plan || '',
      userPrompt: raw.user_prompt || '',
    },
    knowledgeBase: { files: [] },
    tools: [],
    triggers: [],
    permissions: {
      scopeType: 'custom',
      connectedBoards: [],
      connectedDocs: [],
    },
    skills: [],
  };
}

const VALID_KINDS = new Set(['PERSONAL', 'ACCOUNT_LEVEL', 'EXTERNAL']);
function normalizeKind(kind: string): AgentConfig['kind'] {
  const upper = (kind || '').toUpperCase();
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
  const upper = (state || '').toUpperCase();
  if (VALID_STATES.has(upper)) return upper as AgentConfig['state'];
  return 'ACTIVE';
}
