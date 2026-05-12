#!/usr/bin/env npx tsx
/**
 * Create the "Hanna" demo agent in monday.com Agent Builder (instruction-only
 * score band ~78–85 deterministic v1; LLM layers add variance).
 *
 * Usage:
 *   MONDAY_API_TOKEN=xxx npx tsx scripts/provision-hanna-test-agent.ts
 *
 * After create_agent succeeds, paste HANNA_GOAL and HANNA_PLAN from the script
 * output into the Goal and Plan fields in the UI (same limitation as
 * provision-agent.ts — API does not set those fields).
 *
 * Re-run `npx tsx -e` in AGENT_BUILDER_SETUP or use tests/fixtures/hanna-test-agent.json
 * to refresh the fixture when editing scripts/hanna-test-agent-content.ts.
 */

import { createMcpApiClient } from '../src/mcp/monday-api.js';
import {
  HANNA_AGENT_NAME,
  HANNA_GOAL,
  HANNA_PLAN,
  HANNA_ROLE,
  HANNA_ROLE_DESCRIPTION,
  HANNA_USER_PROMPT,
} from './hanna-test-agent-content.js';

const MONDAY_MCP_URL = 'https://mcp.monday.com/mcp';

const token = process.env.MONDAY_API_TOKEN || '';
if (!token) {
  console.error('Set MONDAY_API_TOKEN env var');
  process.exit(1);
}

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
      clientInfo: { name: 'hanna-test-agent-provisioner', version: '1.0.0' },
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

async function main() {
  console.log('=== Provisioning Hanna (test agent) in monday.com ===\n');
  console.log(`  Name: ${HANNA_AGENT_NAME}`);
  console.log(`  user_prompt length: ${HANNA_USER_PROMPT.length} chars\n`);

  const sessionId = await initSession();
  console.log(`Session: ${sessionId}\n`);

  const createResult = await callTool(
    'create_agent',
    {
      name: HANNA_AGENT_NAME,
      role: HANNA_ROLE,
      role_description: HANNA_ROLE_DESCRIPTION,
      user_prompt: HANNA_USER_PROMPT,
    },
    sessionId,
    2,
  );

  console.log('create_agent response (truncated):');
  console.log(createResult.substring(0, 400));

  let agentData: Record<string, unknown>;
  try {
    agentData = JSON.parse(createResult);
  } catch {
    agentData = {};
  }

  const agentId =
    (agentData as { agent?: { id?: string } }).agent?.id ||
    (agentData as { id?: string }).id ||
    'unknown';

  console.log(`\nAgent ID: ${agentId}\n`);

  if (agentId !== 'unknown') {
    const client = createMcpApiClient(token);
    try {
      const agent = await client.getAgent(String(agentId));
      console.log(`Verified: ${agent.profile.name} (${agent.state})\n`);
    } catch (e) {
      console.log(`get_agent verify: ${(e as Error).message}\n`);
    }
  }

  console.log('--- Paste into Agent Builder (Goal field) ---\n');
  console.log(HANNA_GOAL);
  console.log('\n--- Paste into Agent Builder (Plan field) ---\n');
  console.log(HANNA_PLAN);
  console.log(
    '\n=== Done ===\nOpen Agent Builder, find Hanna, paste Goal + Plan, set ACTIVE, then audit this agent by ID.\n',
  );
  console.log(
    'Local v1-only score (see tests/fixtures/hanna-test-agent.json): ~78–79 / B with intentional Completeness + Observability warnings.\n',
  );
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
