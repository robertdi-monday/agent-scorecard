# Agent Scorecard — Agent Builder Setup Guide

This guide walks through creating and deploying the Scorecard Agent in monday.com's Agent Builder. The agent audits other agents' instruction quality using deterministic checks and LLM-powered semantic review, then writes results to a monday.com board.

For the full technical spec, see [`AGENT_BUILDER_V1_SPEC.md`](../AGENT_BUILDER_V1_SPEC.md).

---

## Prerequisites

- A monday.com account with **Agent Builder** access
- A `MONDAY_API_TOKEN` (personal API token with `me:write` scope)
- At least one other agent in the account to use as a test target
- Node.js >= 20 (for the provisioning script and MCP server)

---

## Step 1: Provision the Agent (Programmatic)

The agent is created via the monday MCP server's `create_agent` tool, keeping the config version-controlled.

```bash
MONDAY_API_TOKEN=xxx npx tsx scripts/provision-agent.ts
```

This creates the agent with:
- **Name:** Agent Scorecard
- **Role:** AI Agent Configuration Auditor
- **User Prompt:** Full 10,889-char instruction set from AGENT_BUILDER_V1_SPEC.md Section 3.4

The script outputs the new agent ID (e.g. `40055`).

**API limitation:** The `create_agent` tool does not support setting `goal` and `plan` fields — these must be set manually in the Agent Builder UI (Steps 2–3 below). The `user_prompt` field is the actual instruction text the agent follows; goal and plan are supplementary display metadata.

---

## Step 2: Set the Goal (UI)

Open Agent Builder, find the newly created agent, and paste this into the **Goal** field:

```
Audit a target AI agent's configuration for instruction quality, security vulnerabilities, and prompt engineering best practices. Run deterministic keyword checks and LLM-powered semantic analysis against the agent's goal, plan, and user prompt. Calculate a severity-weighted score, assign a letter grade, and write all findings to a monday.com results board with actionable fix recommendations.
```

---

## Step 3: Set the Plan (UI)

Paste this into the **Plan** field:

```
1. Ask the user for the target agent ID to audit (or list available agents).
2. Call get_agent to retrieve the target agent's configuration.
3. Extract instruction text by concatenating goal + plan + user_prompt.
4. Run 7 deterministic instruction checks (IN-001 through IN-004, EF-001, EF-004, SC-001).
5. Run 4 LLM review checks (LR-001 coherence, LR-002 defense quality, LR-003 plan-goal alignment, LR-005 tailored fixes).
6. Calculate severity-weighted score and letter grade.
7. Create or locate the results board. Create a new group for this audit run.
8. Write each finding as an item on the board with status, score, severity, and recommendation.
9. Write the summary item with overall grade and score.
10. Present the results to the user with the board link.
```

---

## Step 4: Enable Tools

Toggle **on** each of these tools in the Agent Builder tools panel:

- [x] `get_agent` — retrieve target agent configuration
- [x] `create_board` — create results board on first run
- [x] `create_column` — set up board columns on first run
- [x] `create_group` — create a group per audit run
- [x] `create_item` — write individual findings as items
- [x] `change_item_column_values` — populate column values on items
- [x] `get_board_info` — check if results board already exists
- [x] `search` — find existing results board by name

No other tools are needed.

---

## Step 5: Deploy the Custom MCP Server

The Scorecard MCP server provides the `audit_agent` tool over Streamable HTTP transport.

### Option A: Local + Cloudflare Tunnel (Development)

```bash
# Generate an API key
MCP_API_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
echo "MCP_API_KEY: $MCP_API_KEY"

# Start the server
MCP_API_KEY=$MCP_API_KEY PORT=3001 npm run mcp:http

# In another terminal, expose via Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3001
```

The tunnel outputs a public URL like `https://xxx-xxx.trycloudflare.com`. Your MCP endpoint is at `/mcp`.

### Option B: Docker Deployment (Production)

```bash
# Build
docker build -t agent-scorecard-mcp .

# Run
docker run -p 3001:3001 \
  -e MCP_API_KEY=your-secret-key \
  -e PORT=3001 \
  agent-scorecard-mcp
```

Deploy the Docker image to Railway, Fly.io, Render, or any container host. Set `MCP_API_KEY` and `PORT` as environment variables.

### Verify Deployment

```bash
# Health check
curl https://your-url.com/health

# MCP initialize
curl -X POST https://your-url.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

---

## Step 6: Register the Custom MCP in Agent Builder

1. Open Agent Builder → your Scorecard Agent → **Tools** → **Custom MCP**
2. Enter the MCP server URL: `https://your-url.com/mcp`
3. Set the authentication header: `Authorization: Bearer YOUR_MCP_API_KEY`
4. The `audit_agent` tool should appear in the available tools list

---

## Step 7: Activate and Test

1. **Activate** the agent from the Agent Builder settings (agents start in INACTIVE state)
2. **Test with a known agent** — ask: *"Audit agent 40055"* (or any agent ID)
3. **Verify the output:**
   - Agent calls `get_agent` to fetch the target's config
   - Agent calls `audit_agent` on the custom MCP for deterministic checks
   - Agent performs 4 LLM review checks using its own reasoning
   - Agent calculates a weighted score and letter grade
   - Agent writes results to the "Agent Scorecard Results" board
   - Chat summary includes grade, score, pass/fail counts, and top findings

### Workflow

```
User: "Audit agent 35543"
  → Scorecard Agent calls get_agent(35543) on monday MCP
  → Passes config JSON to audit_agent on custom MCP
  → Custom MCP returns ScorecardReport with 7 deterministic results
  → Agent runs 4 LLM checks using its own reasoning
  → Agent combines scores: 60% deterministic + 40% LLM
  → Agent creates board group + items with findings
  → Agent presents summary with grade, score, top issues
```

### Test scenarios

| Scenario | Expected outcome |
|----------|-----------------|
| Agent with minimal instructions | Fails IN-001, IN-002, SC-001; grade capped at C (critical failures) |
| Agent with thorough instructions and security defenses | Most checks pass; grade A or B |
| Invalid agent ID | Error reported, audit stops gracefully |
| Agent in INACTIVE/DELETED state | Audit runs but state is noted in output |

---

## Step 8: Create the Results Board (Optional — Agent Can Do This)

The agent's instructions tell it to create the board automatically on first run. If you prefer to pre-create it:

1. Create a new board named **"Agent Scorecard Results"** (kind: public)
2. Add these columns:

| Title | Type | Notes |
|-------|------|-------|
| Status | Status | Labels: PASS (green, index 1), FAIL (red, index 2), INFO (blue, index 3) |
| Score | Numbers | 0-100 |
| Severity | Status | Labels: critical (red, index 2), warning (yellow, index 3), info (blue, index 4) |
| Category | Text | Instructions / Efficiency / Security / LLM Review |
| Finding | Long Text | What was found |
| Fix | Long Text | How to fix it |
| OWASP | Text | ASI reference if applicable |
| Agent | Text | Name of audited agent |
| Kind | Text | PERSONAL / ACCOUNT_LEVEL / EXTERNAL |
| Grade | Text | A/B/C/D/F (summary row only) |

---

## Limitations (v1)

This agent can only evaluate **instruction-level** configuration. The `get_agent` tool returns goal, plan, and user_prompt but does **not** return tools, knowledge base files, permissions, triggers, or skills.

**Excluded checks** (12 rules + all simulation probes):
- Tool-dependent: EF-002, EF-003, SC-002 through SC-006
- KB-dependent: EF-005, LR-004
- Simulation: all 6 probes

**Covered checks** (7 deterministic + 4 LLM = 11 total):
- IN-001 through IN-004 (instruction quality)
- EF-001, EF-004 (efficiency)
- SC-001 (prompt injection defense)
- LR-001 (coherence), LR-002 (defense quality), LR-003 (alignment), LR-005 (tailored fixes)

See [AGENT_BUILDER_V1_SPEC.md Section 1](../AGENT_BUILDER_V1_SPEC.md) for expansion paths (MCP proxy or expanded `get_agent` API).

---

## Troubleshooting

**Agent can't find the results board**
The agent searches by name "Agent Scorecard Results". If you renamed the board or it was deleted, create a new one following Step 8.

**Status/Severity labels show as numbers instead of text**
The agent uses `create_labels_if_missing: true` when writing items. If labels still don't appear, manually configure the Status and Severity column labels per Step 8.

**Agent says "get_agent failed"**
Verify the target agent ID is correct and belongs to the same account. The `get_agent` tool only works for agents the current user has access to.

**Custom MCP connection fails**
- Verify the MCP URL is accessible: `curl https://your-url.com/health` should return `{"status":"ok"}`
- Check the API key matches: the `Authorization: Bearer xxx` header must use the same `MCP_API_KEY` the server was started with
- Cloudflare Tunnel URLs change on restart — update the custom MCP URL in Agent Builder if using a quick tunnel

**LLM checks seem shallow**
Agent Builder agents use monday's LLM infrastructure, not a direct Anthropic API call. The quality of semantic checks depends on the underlying model. For deeper analysis, use the CLI or embedded app with an Anthropic API key.

**Score doesn't match manual calculation**
The agent applies 60% weight to deterministic checks and 40% to LLM review. LLM checks with numeric scores (0-100) use fractional credit: `(score / 100) * severity_weight`. The critical failure cap (grade capped at C) applies if IN-002, SC-001, or LR-002 fails.
