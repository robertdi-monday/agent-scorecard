/**
 * monday.com API client for fetching agent configurations.
 *
 * Two modes:
 *   1. Public GraphQL API (default) — uses MONDAY_API_TOKEN bearer auth.
 *      Only returns goal, plan, user_prompt, kind, state, profile.
 *   2. Internal REST (future) — uses cookie/CSRF auth against the internal
 *      agent-management endpoint. Returns full config including tools, KB, etc.
 */

const MONDAY_API_URL = 'https://api.monday.com/v2';

/** Shape returned by the public monday GraphQL API for agents. */
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
  getAgent(agentId: string): Promise<PublicAgentResponse>;
}

/**
 * Create a monday API client using the public GraphQL endpoint.
 * Requires a personal API token (bearer auth).
 */
export function createPublicApiClient(token: string): MondayApiClient {
  return {
    async getAgent(agentId: string): Promise<PublicAgentResponse> {
      const query = `
        query GetAgent($agentId: ID!) {
          get_agent(id: $agentId) {
            id
            kind
            state
            version_id
            created_at
            updated_at
            profile {
              name
              role
              role_description
              avatar_url
              background_color
            }
            goal
            plan
            user_prompt
          }
        }
      `;

      const res = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({ query, variables: { agentId } }),
      });

      if (!res.ok) {
        throw new Error(
          `monday API request failed: ${res.status} ${res.statusText}`,
        );
      }

      const body = (await res.json()) as {
        data?: { get_agent?: PublicAgentResponse };
        errors?: Array<{ message: string }>;
      };

      if (body.errors?.length) {
        throw new Error(
          `monday API errors: ${body.errors.map((e) => e.message).join('; ')}`,
        );
      }

      const agent = body.data?.get_agent;
      if (!agent) {
        throw new Error(
          `Agent ${agentId} not found or not accessible with the provided token.`,
        );
      }

      return agent;
    },
  };
}

// ── Internal REST client (future) ────────────────────────────────────────────
//
// When internal API access is available, implement createInternalApiClient()
// that calls GET /monday-agents/agent-management/agents-by-user with
// cookie/CSRF auth and returns the full InternalAgentResponse shape.
// Use mapApiResponseToConfig() from ../mapper/api-to-config.ts for mapping.
