#!/usr/bin/env node

/**
 * MCP server that exposes the Agent Scorecard audit pipeline as tools.
 *
 * Transport: stdio (Agent Builder spawns the server as a child process).
 *
 * The calling agent is expected to fetch the target agent's config itself
 * (via get_agent or similar) and pass the result as JSON to audit_agent.
 * This avoids the need for the MCP server to have its own monday API token.
 *
 * Optional: ANTHROPIC_API_KEY env var for LLM review checks.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { runAudit } from '../auditors/runner.js';
import { SCORECARD_VERSION } from '../config/constants.js';
import type {
  AgentConfig,
  AuditResult,
  ScorecardReport,
} from '../config/types.js';
import {
  buildAllRecommendations,
  calculateOverallScore,
  calculatePillarScores,
  calculateScore,
  deriveScoringWeights,
} from '../scoring/aggregator.js';
import type { MultiLayerInput } from '../scoring/aggregator.js';
import { inferAutonomyTier, tierAwareReady } from '../scoring/autonomy-tier.js';
import { summarizeConfigAuditLayer } from '../report/config-audit-summary.js';
import { runSimulation } from '../simulation/simulator.js';
import { loadConfig } from '../config/loader.js';
import { mapPublicAgentToConfig } from './public-api-mapper.js';

const server = new McpServer({
  name: 'agent-scorecard',
  version: SCORECARD_VERSION,
});

/**
 * Determine whether the config has real tool/KB/permission data or just
 * empty defaults (i.e. came from the public get_agent API).
 * When data is missing, we filter to instruction-only rules to avoid
 * false failures.
 */
function hasFullConfig(config: AgentConfig): boolean {
  return (
    config.tools.length > 0 ||
    config.knowledgeBase.files.length > 0 ||
    config.triggers.length > 0 ||
    config.skills.length > 0
  );
}

// ── Tool: audit_agent ────────────────────────────────────────────────────────

server.registerTool(
  'audit_agent',
  {
    title: 'Audit Agent',
    description:
      'Run the Agent Scorecard audit pipeline against an agent configuration. ' +
      'Pass the agent config as a JSON string (e.g. the output of get_agent). ' +
      'Runs deterministic checks, optionally simulation and LLM review, ' +
      'calculates a severity-weighted score and grade, and returns a ScorecardReport. ' +
      'If the config only has instruction fields (no tools/KB/permissions), ' +
      'only instruction-level rules are evaluated to avoid false failures.',
    inputSchema: {
      agentConfigJson: z
        .string()
        .describe(
          'The agent configuration as a JSON string. ' +
            'This should be the output of get_agent or a full AgentConfig object.',
        ),
      includeLlmReview: z
        .boolean()
        .optional()
        .describe(
          'Run LLM-powered semantic review checks (Q-002, S-003, Q-003, Q-004). ' +
            'Requires ANTHROPIC_API_KEY env var or anthropicApiKey parameter.',
        ),
      includeSimulation: z
        .boolean()
        .optional()
        .describe(
          'Run adversarial simulation probes. ' +
            'Most useful when the config includes tool and permission data.',
        ),
      anthropicApiKey: z
        .string()
        .optional()
        .describe(
          'Anthropic API key for LLM review. Falls back to ANTHROPIC_API_KEY env var.',
        ),
    },
  },
  async ({
    agentConfigJson,
    includeLlmReview,
    includeSimulation,
    anthropicApiKey,
  }) => {
    try {
      const config = parseAgentConfig(agentConfigJson);

      const allResults = runAudit(config);

      // If config lacks tools/KB/permissions, filter to instruction-only rules
      // (those with a `pillar` tag — i.e. v1-compatible rules).
      const results = hasFullConfig(config)
        ? allResults
        : allResults.filter((r) => r.pillar !== undefined);

      const layer = summarizeConfigAuditLayer(results);
      const phasesRun: string[] = ['config-audit'];

      const multiLayerInput: MultiLayerInput = {
        configAuditResults: results,
      };

      let simulationLayer: ScorecardReport['layers']['simulation'];
      let llmReviewLayer: ScorecardReport['layers']['llmReview'];

      if (includeSimulation) {
        const simSummary = runSimulation(config);
        multiLayerInput.simulationSummary = simSummary;
        simulationLayer = {
          overallResilience: simSummary.overallResilience,
          probeCount: simSummary.probeCount,
          resilient: simSummary.resilient,
          partial: simSummary.partial,
          vulnerable: simSummary.vulnerable,
          results: simSummary.results,
        };
        phasesRun.push('simulation');
      }

      if (includeLlmReview) {
        const apiKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
        if (!apiKey) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'LLM review requested but no API key provided. Set ANTHROPIC_API_KEY env var or pass anthropicApiKey parameter.',
              },
            ],
            isError: true,
          };
        }

        const { createAnthropicClient } =
          await import('../llm-review/llm-client.js');
        const { runLlmReview } = await import('../llm-review/reviewer.js');

        const llmClient = createAnthropicClient(apiKey);
        const failedRules = results.filter((r: AuditResult) => !r.passed);
        const simulationGaps =
          multiLayerInput.simulationSummary?.results
            .filter((r) => r.verdict !== 'resilient')
            .flatMap((r) => r.gaps) ?? [];

        const llmSummary = await runLlmReview(
          config,
          llmClient,
          failedRules,
          simulationGaps,
        );
        multiLayerInput.llmReviewSummary = llmSummary;
        llmReviewLayer = {
          overallScore: llmSummary.overallScore,
          checkCount: llmSummary.checkCount,
          passed: llmSummary.passed,
          failed: llmSummary.failed,
          results: llmSummary.results,
          tailoredFixes: llmSummary.tailoredFixes,
        };
        phasesRun.push('llm-review');
      }

      const score =
        multiLayerInput.simulationSummary || multiLayerInput.llmReviewSummary
          ? calculateOverallScore(multiLayerInput)
          : calculateScore(results);

      const weights = deriveScoringWeights(multiLayerInput);

      const pillarScores = calculatePillarScores(
        results,
        multiLayerInput.llmReviewSummary,
      );

      const tierInference = inferAutonomyTier(config);
      const tierGate = tierAwareReady(
        tierInference.tier,
        score.score,
        score.grade,
      );
      const finalRecommendation =
        score.deploymentRecommendation === 'ready' && !tierGate.ready
          ? 'needs-fixes'
          : score.deploymentRecommendation;

      const report: ScorecardReport = {
        metadata: {
          agentId: config.agentId,
          agentName: config.agentName,
          timestamp: new Date().toISOString(),
          scorecardVersion: SCORECARD_VERSION,
          phasesRun,
          scoringWeights: { ...weights },
          autonomyTier: tierInference.tier,
          autonomyTierRationale: tierInference.rationale,
        },
        overallScore: score.score,
        overallGrade: score.grade,
        pillarScores,
        deploymentRecommendation: finalRecommendation,
        layers: {
          configAudit: {
            score: calculateScore(results).score,
            totalChecks: layer.totalChecks,
            passed: layer.passed,
            failed: layer.failed,
            warnings: layer.warnings,
            infoIssues: layer.infoIssues,
            results,
          },
          ...(simulationLayer ? { simulation: simulationLayer } : {}),
          ...(llmReviewLayer ? { llmReview: llmReviewLayer } : {}),
        },
        recommendations: buildAllRecommendations(
          results,
          multiLayerInput.llmReviewSummary,
        ),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Audit failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Config parsing ───────────────────────────────────────────────────────────

/**
 * Parse agent config from JSON string. Accepts:
 *   1. A full AgentConfig object (from the CLI/app fixtures)
 *   2. A get_agent response (public API shape with user_prompt, profile, etc.)
 *   3. The MCP tool wrapper: { message: "...", agent: { ... } }
 */
function parseAgentConfig(jsonStr: string): AgentConfig {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JSON: could not parse agentConfigJson.');
  }

  // Handle MCP tool wrapper: { message, agent: { ... } }
  if ('agent' in parsed && typeof parsed.agent === 'object' && parsed.agent) {
    const agent = parsed.agent as Record<string, unknown>;
    if ('user_prompt' in agent && 'profile' in agent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mapPublicAgentToConfig(agent as any);
    }
  }

  // Direct get_agent shape (user_prompt + profile at top level)
  if ('user_prompt' in parsed && 'profile' in parsed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapPublicAgentToConfig(parsed as any);
  }

  // Otherwise, treat as AgentConfig — use loadConfig for validation
  return loadConfig(parsed);
}

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
