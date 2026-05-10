#!/usr/bin/env npx tsx
/**
 * End-to-end test of the full Agent Builder workflow:
 *   1. Fetch agent config via monday MCP (mcp.monday.com/mcp)
 *   2. Pass the config JSON to our deployed HTTP MCP server's audit_agent tool
 *   3. Display the ScorecardReport
 *
 * Usage:
 *   MONDAY_API_TOKEN=xxx MCP_URL=https://xxx.trycloudflare.com/mcp MCP_API_KEY=xxx \
 *     npx tsx scripts/test-e2e-http-mcp.ts [agentId]
 */

import { createMcpApiClient } from '../src/mcp/monday-api.js';

const token = process.env.MONDAY_API_TOKEN || '';
const mcpUrl = process.env.MCP_URL || 'http://localhost:3001/mcp';
const mcpApiKey = process.env.MCP_API_KEY || '';
const agentId = process.argv[2] || '35543';

if (!token) {
  console.error('Set MONDAY_API_TOKEN env var');
  process.exit(1);
}

async function scorecardMcpCall(
  method: string,
  params: Record<string, unknown>,
  id: number,
  sessionId?: string,
): Promise<{ data: unknown; sessionId: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (mcpApiKey) headers['Authorization'] = `Bearer ${mcpApiKey}`;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Scorecard MCP ${res.status}: ${body}`);
  }

  const sid = res.headers.get('mcp-session-id') || sessionId || '';
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) throw new Error(`Bad response: ${text.substring(0, 300)}`);
  const parsed = JSON.parse(dataLine.replace('data: ', ''));
  if (parsed.error) throw new Error(JSON.stringify(parsed.error));
  return { data: parsed.result, sessionId: sid };
}

async function main() {
  console.log('=== E2E: monday MCP → Scorecard HTTP MCP ===\n');
  console.log(`Target agent: ${agentId}`);
  console.log(`Scorecard MCP: ${mcpUrl}\n`);

  // Step 1: Fetch agent from monday
  console.log('Step 1: Fetching agent via monday MCP server...');
  const client = createMcpApiClient(token);
  const raw = await client.getAgent(agentId);
  console.log(`  Agent: ${raw.profile.name} | Kind: ${raw.kind} | State: ${raw.state}`);
  console.log(`  Instruction text: ${raw.goal.length + raw.plan.length + raw.user_prompt.length} chars\n`);

  // Step 2: Initialize scorecard MCP session
  console.log('Step 2: Initializing scorecard MCP session...');
  const { sessionId } = await scorecardMcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '1.0.0' },
  }, 1);
  console.log(`  Session: ${sessionId}`);

  // Send initialized notification
  const notifyHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Mcp-Session-Id': sessionId,
  };
  if (mcpApiKey) notifyHeaders['Authorization'] = `Bearer ${mcpApiKey}`;
  await fetch(mcpUrl, {
    method: 'POST',
    headers: notifyHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });

  // Step 3: Call audit_agent with the raw get_agent response
  console.log('\nStep 3: Calling audit_agent on scorecard MCP...');
  const { data } = await scorecardMcpCall('tools/call', {
    name: 'audit_agent',
    arguments: { agentConfigJson: JSON.stringify(raw) },
  }, 2, sessionId);

  const result = data as { content?: Array<{ type: string; text: string }> };
  const textContent = result.content?.find((c) => c.type === 'text');
  if (!textContent) {
    console.error('No text content in response');
    process.exit(1);
  }

  const report = JSON.parse(textContent.text);

  // Step 4: Display results
  console.log('\n=== Scorecard Report ===\n');
  console.log(`Agent: ${report.metadata.agentName} (ID: ${report.metadata.agentId})`);
  console.log(`Grade: ${report.overallGrade} (${report.overallScore}/100)`);
  console.log(`Deployment: ${report.deploymentRecommendation}`);
  console.log(`Phases: ${report.metadata.phasesRun.join(', ')}`);
  console.log(`Version: ${report.metadata.scorecardVersion}\n`);

  const ca = report.layers.configAudit;
  console.log(`Config Audit: ${ca.passed} passed, ${ca.failed} failed, ${ca.warnings} warnings, ${ca.infoIssues} info`);

  console.log('\nDetailed results:');
  for (const r of ca.results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.ruleId} [${r.severity}] ${r.passed ? 'PASS' : 'FAIL'}`);
    if (!r.passed && r.message) {
      console.log(`    → ${r.message.substring(0, 120)}`);
    }
  }

  if (report.recommendations?.length) {
    console.log(`\nTop recommendations:`);
    for (const rec of report.recommendations.slice(0, 3)) {
      console.log(`  [${rec.priority}] ${rec.title}`);
      console.log(`    ${rec.howToFix.substring(0, 100)}`);
    }
  }

  console.log('\n=== E2E Test Complete ===');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
