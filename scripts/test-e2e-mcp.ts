#!/usr/bin/env npx tsx
/**
 * End-to-end test: fetch agent via monday MCP server → run audit pipeline → show report
 */

import { createMcpApiClient } from '../src/mcp/monday-api.js';
import {
  mapPublicAgentToConfig,
  INSTRUCTION_ONLY_RULE_IDS,
} from '../src/mcp/public-api-mapper.js';
import { runAudit } from '../src/auditors/runner.js';
import { calculateScore } from '../src/scoring/aggregator.js';
import { summarizeConfigAuditLayer } from '../src/report/config-audit-summary.js';

const token = process.env.MONDAY_API_TOKEN || '';

if (!token) {
  console.error('Set MONDAY_API_TOKEN env var');
  process.exit(1);
}

const agentId = process.argv[2] || '40014';

async function main() {
  console.log('=== End-to-End MCP Pipeline Test ===\n');

  console.log(`Step 1: Fetching agent ${agentId} via monday MCP server...`);
  const client = createMcpApiClient(token);
  const raw = await client.getAgent(agentId);
  console.log(
    `  Agent: ${raw.profile.name} | Kind: ${raw.kind} | State: ${raw.state}`,
  );
  console.log(`  Plan length: ${raw.plan.length} chars`);
  console.log(`  Goal length: ${raw.goal.length} chars`);
  console.log(`  User prompt length: ${raw.user_prompt.length} chars\n`);

  console.log('Step 2: Mapping to AgentConfig...');
  const config = mapPublicAgentToConfig(raw);
  const instrTotal =
    config.instructions.goal.length +
    config.instructions.plan.length +
    config.instructions.userPrompt.length;
  console.log(`  Agent ID: ${config.agentId}`);
  console.log(`  Instructions total: ${instrTotal} chars\n`);

  console.log('Step 3: Running deterministic audit (instruction-only rules)...');
  const allResults = runAudit(config);
  const results = allResults.filter((r) =>
    INSTRUCTION_ONLY_RULE_IDS.has(r.ruleId),
  );
  console.log(`  Total rules run: ${allResults.length}`);
  console.log(`  Instruction-only rules evaluated: ${results.length}\n`);

  console.log('Step 4: Scoring...');
  const score = calculateScore(results);
  console.log(`  Score: ${score.score} / 100`);
  console.log(`  Grade: ${score.grade}`);
  console.log(`  Deployment: ${score.deploymentRecommendation}\n`);

  console.log('Step 5: Detailed results:');
  const layer = summarizeConfigAuditLayer(results);
  console.log(
    `  Passed: ${layer.passed} | Failed: ${layer.failed} | Warnings: ${layer.warnings}`,
  );
  console.log('');
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(
      `  ${icon} ${r.ruleId} [${r.severity}] ${r.passed ? 'PASS' : 'FAIL'}`,
    );
    if (!r.passed && r.message)
      console.log(`    → ${r.message.substring(0, 120)}`);
  }

  console.log('\n=== Test Complete ===');
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
