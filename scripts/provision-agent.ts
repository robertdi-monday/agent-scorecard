#!/usr/bin/env npx tsx
/**
 * Provision the Scorecard Agent in monday.com Agent Builder via the monday MCP
 * server's create_agent tool.
 *
 * Usage:
 *   MONDAY_API_TOKEN=xxx npx tsx scripts/provision-agent.ts
 *
 * The agent metadata + user_prompt are imported from
 * `src/agent-builder/agent-prompt.ts`, which composes the prompt from per-rule
 * `agentPromptSnippet` fields. This is the SINGLE source of truth — never edit
 * the prompt prose here.
 *
 * Note on monday's create_agent modes: the tool accepts EITHER prompt mode
 * (single `prompt` field, monday auto-generates the profile) OR manual mode
 * (`name` + `role` + `role_description` + optional `user_prompt`). They are
 * mutually exclusive — passing both yields:
 *   "Error: create_agent accepts either prompt mode or manual mode."
 * We use manual mode so name + role + user_prompt are deterministic and the
 * codebase remains the single source of truth.
 *
 * The goal and plan fields are NOT settable via either mode — they must be
 * pasted in the Agent Builder UI afterward (see AGENT_BUILDER_SETUP.md
 * Steps 2-3). The user_prompt IS the full instruction text the agent follows;
 * goal/plan are supplementary display metadata.
 *
 * Known monday-side issue (observed 2026-05-10): the entire agent-management
 * surface (create_agent, get_agent, delete_agent) returns generic "Internal
 * server error" 500s on some accounts while non-agent MCP tools (search,
 * get_user_context, board ops) work normally. This script will fail with the
 * same 500 until monday's agent-management service recovers — it is not a
 * client-side fix. Re-run as soon as the platform recovers.
 */

import { createMcpApiClient } from '../src/mcp/monday-api.js';
import {
  AGENT_NAME,
  AGENT_ROLE,
  AGENT_ROLE_DESCRIPTION,
  AGENT_USER_PROMPT,
} from '../src/agent-builder/agent-prompt.js';

const MONDAY_MCP_URL = 'https://mcp.monday.com/mcp';

const token = process.env.MONDAY_API_TOKEN || '';
if (!token) {
  console.error('Set MONDAY_API_TOKEN env var');
  process.exit(1);
}

// ── MCP client for calling create_agent ──────────────────────────────────────

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  Authorization: `Bearer ${token}`,
};

async function mcpCall(
  method: string,
  params: Record<string, unknown>,
  id: number,
  sessionId?: string,
): Promise<{ data: unknown; sessionId: string }> {
  const reqHeaders: Record<string, string> = { ...headers };
  if (sessionId) reqHeaders['Mcp-Session-Id'] = sessionId;

  const res = await fetch(MONDAY_MCP_URL, {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  if (!res.ok) {
    throw new Error(
      `monday MCP request failed: ${res.status} ${res.statusText}`,
    );
  }

  const sid = res.headers.get('mcp-session-id') || sessionId || '';
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) {
    throw new Error(
      `Unexpected MCP response format: ${text.substring(0, 500)}`,
    );
  }
  const parsed = JSON.parse(dataLine.replace('data: ', ''));
  if (parsed.error) {
    throw new Error(
      `MCP error: ${parsed.error.message || JSON.stringify(parsed.error)}`,
    );
  }
  return { data: parsed.result, sessionId: sid };
}

async function initSession(): Promise<string> {
  const { sessionId } = await mcpCall(
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'agent-scorecard-provisioner', version: '1.0.0' },
    },
    1,
  );

  const reqHeaders: Record<string, string> = { ...headers };
  if (sessionId) reqHeaders['Mcp-Session-Id'] = sessionId;
  await fetch(MONDAY_MCP_URL, {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });

  return sessionId;
}

async function callTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionId: string,
  requestId: number,
): Promise<string> {
  const { data } = await mcpCall(
    'tools/call',
    { name: toolName, arguments: args },
    requestId,
    sessionId,
  );

  const result = data as { content?: Array<{ type: string; text: string }> };
  const textContent = result.content?.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error(`${toolName} returned no text content`);
  }
  return textContent.text;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    '=== Provisioning Agent Scorecard in monday.com Agent Builder ===\n',
  );
  console.log(`  Agent name: ${AGENT_NAME}`);
  console.log(`  Prompt length: ${AGENT_USER_PROMPT.length} chars\n`);

  console.log('Step 1: Initializing MCP session...');
  const sessionId = await initSession();
  console.log(`  Session: ${sessionId}\n`);

  console.log('Step 2: Creating agent via create_agent (manual mode)...');
  const createResult = await callTool(
    'create_agent',
    {
      // Manual mode — DO NOT add a `prompt` field, monday rejects mixed mode
      // ("create_agent accepts either prompt mode or manual mode").
      name: AGENT_NAME,
      role: AGENT_ROLE,
      role_description: AGENT_ROLE_DESCRIPTION,
      user_prompt: AGENT_USER_PROMPT,
    },
    sessionId,
    2,
  );

  console.log('  create_agent response:');
  console.log(`  ${createResult.substring(0, 500)}`);

  let agentData: Record<string, unknown>;
  try {
    agentData = JSON.parse(createResult);
  } catch {
    console.log(`\n  Full response: ${createResult}`);
    agentData = {};
  }

  const agentId =
    (agentData as { agent?: { id?: string } }).agent?.id ||
    (agentData as { id?: string }).id ||
    'unknown';

  console.log(`\n  Agent ID: ${agentId}`);

  // Verify by fetching back
  if (agentId !== 'unknown') {
    console.log('\nStep 3: Verifying agent via get_agent...');
    const client = createMcpApiClient(token);
    try {
      const agent = await client.getAgent(String(agentId));
      console.log(`  Name: ${agent.profile.name}`);
      console.log(`  Kind: ${agent.kind}`);
      console.log(`  State: ${agent.state}`);
      console.log(`  Goal length: ${agent.goal.length} chars`);
      console.log(`  Plan length: ${agent.plan.length} chars`);
      console.log(`  User prompt length: ${agent.user_prompt.length} chars`);
      if (agent.user_prompt.length !== AGENT_USER_PROMPT.length) {
        console.log(
          `  ⚠ Prompt length differs from local source — re-run provisioner if intentional drift.`,
        );
      } else {
        console.log(`  ✓ Prompt length matches local source.`);
      }
    } catch (e) {
      console.log(`  Verification fetch failed: ${(e as Error).message}`);
    }
  }

  console.log('\n=== Provisioning Complete ===');
  console.log(`\nNext steps:`);
  console.log(
    `  1. Open Agent Builder in monday.com and find agent "${AGENT_NAME}" (ID: ${agentId})`,
  );
  console.log(
    `  2. Enable required tools: get_agent, create_board, create_column, create_group, create_item, change_item_column_values, get_board_info, search`,
  );
  console.log(`  3. Add custom MCP URL for the scorecard audit service`);
  console.log(`  4. Test: ask the agent to "Audit agent <id>"`);
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
