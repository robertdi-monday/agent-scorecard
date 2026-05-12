#!/usr/bin/env node

/**
 * MCP server with Streamable HTTP transport for deployment as a custom MCP
 * in monday.com Agent Builder.
 *
 * Authenticates incoming requests via a shared secret in the Authorization header.
 * The audit_agent tool is the same as in server.ts (stdio version).
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { runAudit } from '../auditors/runner.js';
import { SCORECARD_VERSION } from '../config/constants.js';
import type {
  AgentConfig,
  AuditResult,
  ScorecardReport,
} from '../config/types.js';
import { createMcpApiClient } from './monday-api.js';
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

const MCP_API_KEY = process.env.MCP_API_KEY || '';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN || '';
const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Auth helper ──────────────────────────────────────────────────────────────

function authenticate(req: IncomingMessage): boolean {
  if (!MCP_API_KEY) return true; // no key configured = open (dev mode)
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  return token === MCP_API_KEY;
}

// ── MCP Server setup ─────────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'agent-scorecard',
    version: SCORECARD_VERSION,
  });

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
          .default(true)
          .describe(
            'Run LLM-powered semantic review checks (Q-002, S-003, Q-003, Q-004). ' +
              'Defaults to true. Requires ANTHROPIC_API_KEY env var or anthropicApiKey parameter; ' +
              'falls back to deterministic-only scoring if no key is available.',
          ),
        includeSimulation: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            'Run adversarial simulation probes. Defaults to true. ' +
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
      const auditStarted = Date.now();
      const inputChars = agentConfigJson?.length ?? 0;
      console.log(
        `[audit_agent] start inputChars=${inputChars} llm=${includeLlmReview} sim=${includeSimulation}`,
      );
      try {
        const config = parseAgentConfig(agentConfigJson);
        const allResults = runAudit(config);

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
            console.log(
              'LLM review enabled but no API key available — falling back to deterministic-only scoring.',
            );
          } else {
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

        const body = JSON.stringify(report, null, 2);
        const elapsed = Date.now() - auditStarted;
        console.log(
          `[audit_agent] ok elapsedMs=${elapsed} outChars=${body.length} agent=${config.agentName || config.agentId}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: body,
            },
          ],
        };
      } catch (err) {
        const elapsed = Date.now() - auditStarted;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[audit_agent] error elapsedMs=${elapsed} ${msg}`);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Audit failed: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tool: get_agent ───────────────────────────────────────────────────────

  server.registerTool(
    'get_agent',
    {
      title: 'Get Agent Configuration',
      description:
        'Retrieve a monday.com agent configuration by ID. Returns goal, plan, ' +
        'user_prompt, kind, state, and profile. If no ID is provided, returns ' +
        'the first agent found for the current user.',
      inputSchema: {
        agentId: z
          .string()
          .optional()
          .describe('The agent ID to retrieve. Omit to get the default agent.'),
      },
    },
    async ({ agentId }) => {
      if (!MONDAY_API_TOKEN) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'MONDAY_API_TOKEN not configured on the MCP server.',
            },
          ],
          isError: true,
        };
      }
      try {
        const client = createMcpApiClient(MONDAY_API_TOKEN);
        const agent = await client.getAgent(agentId);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(agent, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `get_agent failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tool: list_agents ──────────────────────────────────────────────────────

  server.registerTool(
    'list_agents',
    {
      title: 'List Agents',
      description:
        "List all monday.com agents accessible to the server's API token holder. " +
        'Use this to find an agent by name when the user does not know the numeric ID. ' +
        'Returns an array of agent summaries with id, name, kind, and state (up to 100). ' +
        'Agents owned by other users may not appear but can still be fetched by ID via get_agent.',
      inputSchema: {},
    },
    async () => {
      if (!MONDAY_API_TOKEN) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'MONDAY_API_TOKEN not configured on the MCP server.',
            },
          ],
          isError: true,
        };
      }
      try {
        const client = createMcpApiClient(MONDAY_API_TOKEN);
        const agents = await client.listAgents();
        const summary = agents.map((a) => ({
          id: a.id,
          name: a.profile.name,
          kind: a.kind,
          state: a.state,
        }));
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(summary, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `list_agents failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tool: monday_tool (proxy to monday MCP) ───────────────────────────────

  server.registerTool(
    'monday_tool',
    {
      title: 'Monday Platform Tool',
      description:
        'Proxy call to any monday.com MCP platform tool (create_board, create_item, ' +
        'create_group, create_column, change_item_column_values, get_board_info, search, etc.). ' +
        'Pass the tool name and its arguments as a JSON object.',
      inputSchema: {
        toolName: z
          .string()
          .describe(
            'The monday MCP tool name (e.g. "create_board", "create_item", "search").',
          ),
        arguments: z.string().describe('JSON string of the tool arguments.'),
      },
    },
    async ({ toolName, arguments: argsJson }) => {
      if (!MONDAY_API_TOKEN) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'MONDAY_API_TOKEN not configured on the MCP server.',
            },
          ],
          isError: true,
        };
      }
      try {
        const args = JSON.parse(argsJson) as Record<string, unknown>;
        const result = await callMondayTool(toolName, args);
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `monday_tool(${toolName}) failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ── Monday MCP proxy ─────────────────────────────────────────────────────────

const MONDAY_MCP_URL = 'https://mcp.monday.com/mcp';

async function callMondayTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${MONDAY_API_TOKEN}`,
  };

  // Initialize session
  let res = await fetch(MONDAY_MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agent-scorecard-proxy', version: '1.0.0' },
      },
    }),
  });

  const sessionId = res.headers.get('mcp-session-id') || '';
  const sessionHeaders = { ...headers, 'Mcp-Session-Id': sessionId };

  // Send initialized notification
  await fetch(MONDAY_MCP_URL, {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });

  // Call the tool
  res = await fetch(MONDAY_MCP_URL, {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new Error(`monday MCP ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine)
    throw new Error(`Unexpected response: ${text.substring(0, 200)}`);
  const parsed = JSON.parse(dataLine.replace('data: ', ''));
  if (parsed.error) {
    throw new Error(parsed.error.message || JSON.stringify(parsed.error));
  }

  const content = parsed.result?.content?.find(
    (c: { type: string; text: string }) => c.type === 'text',
  );
  return content?.text || JSON.stringify(parsed.result);
}

// ── Config parsing ───────────────────────────────────────────────────────────

function hasFullConfig(config: AgentConfig): boolean {
  return (
    config.tools.length > 0 ||
    config.knowledgeBase.files.length > 0 ||
    config.triggers.length > 0 ||
    config.skills.length > 0
  );
}

function parseAgentConfig(jsonStr: string): AgentConfig {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JSON: could not parse agentConfigJson.');
  }

  if ('agent' in parsed && typeof parsed.agent === 'object' && parsed.agent) {
    const agent = parsed.agent as Record<string, unknown>;
    if ('user_prompt' in agent && 'profile' in agent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mapPublicAgentToConfig(agent as any);
    }
  }

  if ('user_prompt' in parsed && 'profile' in parsed) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapPublicAgentToConfig(parsed as any);
  }

  return loadConfig(parsed);
}

// ── Transport management ─────────────────────────────────────────────────────

const transports = new Map<string, StreamableHTTPServerTransport>();

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  if (!authenticate(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (req.method === 'POST') {
    // Read body
    const body = await readBody(req);

    if (!sessionId) {
      // New session — check if this is an initialize request
      const parsed = JSON.parse(body);
      const isInit =
        (Array.isArray(parsed) &&
          parsed.some((m: { method?: string }) => m.method === 'initialize')) ||
        parsed.method === 'initialize';

      if (isInit) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const server = createMcpServer();
        await server.connect(transport);

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
        };

        await transport.handleRequest(req, res, JSON.parse(body));

        const sid = transport.sessionId;
        if (sid) transports.set(sid, transport);
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Missing mcp-session-id header. Initialize first.',
        }),
      );
      return;
    }

    // Existing session
    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found. Re-initialize.' }));
      return;
    }

    await transport.handleRequest(req, res, JSON.parse(body));
    return;
  }

  if (req.method === 'GET') {
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing mcp-session-id header.' }));
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found.' }));
      return;
    }

    await transport.handleRequest(req, res);
    return;
  }

  if (req.method === 'DELETE') {
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing mcp-session-id header.' }));
      return;
    }

    const transport = transports.get(sessionId);
    if (transport) {
      await transport.close();
      transports.delete(sessionId);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ── HTTP Server ──────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`,
  );

  console.log(
    `[${new Date().toISOString()}] ${req.method} ${url.pathname} auth=${req.headers.authorization ? 'present' : 'missing'} session=${req.headers['mcp-session-id'] || 'none'}`,
  );

  // Health check
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: SCORECARD_VERSION }));
    return;
  }

  // MCP endpoint
  if (url.pathname === '/mcp') {
    try {
      await handleMcpRequest(req, res);
    } catch (err) {
      console.error('MCP request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error:
        'Not found. Use /mcp for MCP protocol or /health for health check.',
    }),
  );
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Agent Scorecard MCP server (HTTP) v${SCORECARD_VERSION}`);
  console.log(`Listening on http://0.0.0.0:${PORT}/mcp`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  console.log(
    `Auth: ${MCP_API_KEY ? 'enabled (MCP_API_KEY set)' : 'disabled (no MCP_API_KEY)'}`,
  );
});
