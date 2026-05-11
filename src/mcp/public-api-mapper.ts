/**
 * Maps the public get_agent API response to an AgentConfig.
 *
 * The public API only returns instruction-level fields (goal, plan, user_prompt,
 * kind, state, profile). Tools, KB, permissions, triggers, and skills are NOT
 * available and default to empty values.
 */

import type { AgentConfig, AuditRule } from '../config/types.js';
import type { PublicAgentResponse } from './monday-api.js';
import { getRulesForVertical } from '../auditors/runner.js';

/**
 * v1 / "instruction-only" gate. Returns true if the rule can be evaluated
 * from the get_agent envelope alone (goal, plan, user_prompt, kind, state).
 *
 * Implementation: a rule is v1 iff it carries a `pillar` tag. This replaces
 * the old hand-curated allow-list (`INSTRUCTION_ONLY_RULE_IDS`) — the
 * snapshot was frozen and silently excluded any newly added v1 rule from
 * the MCP filter. Use the predicate, never re-introduce a hard-coded set.
 */
export function isInstructionOnlyRule(rule: AuditRule): boolean {
  return rule.pillar !== undefined;
}

/**
 * Live equivalent of the old `INSTRUCTION_ONLY_RULE_IDS` snapshot. Computed
 * by filtering `getRulesForVertical()` on `pillar` so newly added v1 rules
 * are picked up automatically. Only use this if you genuinely need the IDs
 * as strings (e.g. to filter pre-computed results by ID); when you have an
 * `AuditRule` in hand, prefer `isInstructionOnlyRule(rule)`.
 */
export function instructionOnlyRuleIds(): Set<string> {
  return new Set(
    getRulesForVertical()
      .filter(isInstructionOnlyRule)
      .map((r) => r.id),
  );
}

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
