/**
 * The frozen agent prompt. Computed once from the canonical builder so
 * `provision-agent.ts` can import a single string without re-running the
 * composer logic. To update the live agent, ship a new release of this
 * package and re-run `MONDAY_API_TOKEN=xxx npx tsx scripts/provision-agent.ts`.
 *
 * If you need to tweak the prompt, edit per-rule `agentPromptSnippet` fields,
 * not this constant — it will recompute on rebuild.
 */

import {
  AGENT_NAME,
  AGENT_ROLE,
  AGENT_ROLE_DESCRIPTION,
  buildAgentPrompt,
} from './build-agent-prompt.js';

export const AGENT_USER_PROMPT: string = buildAgentPrompt();

export { AGENT_NAME, AGENT_ROLE, AGENT_ROLE_DESCRIPTION };
