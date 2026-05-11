/**
 * monday.com API client for fetching agent configurations.
 *
 * Uses the official monday MCP server (mcp.monday.com/mcp) which exposes
 * get_agent as an MCP tool. This is the same surface Agent Builder uses
 * internally. Authentication is via personal API token as Bearer.
 *
 * Returns: id, kind, state, profile, goal, plan, user_prompt, version_id,
 *          created_at, updated_at.
 * Does NOT return: tools, KB files, permissions, triggers, skills.
 */

const MONDAY_MCP_URL = 'https://mcp.monday.com/mcp';

/** Shape returned by the monday MCP get_agent tool. */
export interface PublicAgentResponse {
  id: string;
  kind: string;
  state: string;
  version_id?: string;
  created_at?: string;
  updated_at?: string;
  profile: {
    name: string;
    role?: string;
    role_description?: string;
    avatar_url?: string;
    background_color?: string;
  };
  goal: string;
  plan: string;
  user_prompt: string;
}

export interface MondayApiClient {
  getAgent(agentId?: string): Promise<PublicAgentResponse>;
  listAgents(): Promise<PublicAgentResponse[]>;
}

/**
 * Create a monday API client that communicates via the monday MCP server.
 * Requires a personal API token (used as Bearer auth).
 */
export function createMcpApiClient(token: string): MondayApiClient {
  const headers = {
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
        `Unexpected MCP response format: ${text.substring(0, 200)}`,
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
        clientInfo: { name: 'agent-scorecard', version: '1.0.0' },
      },
      1,
    );

    // Send initialized notification (fire-and-forget)
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
  ): Promise<string> {
    const sessionId = await initSession();
    const { data } = await mcpCall(
      'tools/call',
      { name: toolName, arguments: args },
      2,
      sessionId,
    );

    const result = data as { content?: Array<{ type: string; text: string }> };
    const textContent = result.content?.find((c) => c.type === 'text');
    if (!textContent) {
      throw new Error('MCP tool returned no text content');
    }
    return textContent.text;
  }

  return {
    async getAgent(agentId?: string): Promise<PublicAgentResponse> {
      const args: Record<string, unknown> = {};
      if (agentId) args.id = agentId;

      const text = await callTool('get_agent', args);
      const parsed = JSON.parse(text) as {
        agent?: PublicAgentResponse;
        agents?: PublicAgentResponse[];
        message?: string;
      };

      if (parsed.agent) return parsed.agent;
      if (parsed.agents?.length) return parsed.agents[0];
      throw new Error(
        `Agent ${agentId || '(list)'} not found or not accessible.`,
      );
    },

    async listAgents(): Promise<PublicAgentResponse[]> {
      const text = await callTool('get_agent', {});
      const parsed = JSON.parse(text) as {
        agents?: PublicAgentResponse[];
        agent?: PublicAgentResponse;
      };

      if (parsed.agents) return parsed.agents;
      if (parsed.agent) return [parsed.agent];
      return [];
    },
  };
}
