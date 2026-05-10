# Changelog

## 1.2.1 — 2026-05-10

### Fixed

- **monday API client** — `get_agent` is an MCP tool on `mcp.monday.com/mcp`, not a public GraphQL query. Rewrote `src/mcp/monday-api.ts` to use Streamable HTTP transport against the monday MCP server instead of the GraphQL API.
  - `createMcpApiClient(token)` replaces `createPublicApiClient(token)`
  - Added `listAgents()` method to enumerate all user agents
  - Auth via personal API token as Bearer (same token, correct transport)
- `parseAgentConfig` in `server.ts` now handles the MCP wrapper format (`{ message, agent: {...} }`)

### Verified

- End-to-end pipeline tested against all 3 live agents (40014, 40033, 35543)
- Agent 40014 "Agent Scorecard": D (46.7/100) — missing guardrails + injection defense
- Agent 40033 "MCP chain test": F (33.3/100) — also missing error handling + scope boundaries
- Agent 35543 "test": F (33.3/100) — same pattern

## 1.2.0 — 2026-05-10

### Added

- **Agent Builder v1** — Scorecard Agent that runs natively inside monday.com Agent Builder
  - 7 deterministic instruction checks (IN-001–IN-004, EF-001, EF-004, SC-001)
  - 4 LLM-powered semantic reviews (LR-001 coherence, LR-002 defense quality, LR-003 alignment, LR-005 tailored fixes)
  - Severity-weighted scoring with critical failure grade cap
  - Board output with per-audit groups, per-check items, and summary row
- `AGENT_BUILDER_V1_SPEC.md` — full implementation spec for the instruction-driven agent
- `docs/AGENT_BUILDER_SETUP.md` — step-by-step setup guide with copy-paste configuration blocks
- Agent Builder section in README
- **MCP Server** — exposes the audit pipeline as MCP tools over stdio
  - `audit_agent` tool: accepts agent config JSON, runs deterministic checks, optional LLM review, scoring
  - Automatic rule filtering to instruction-only checks when config lacks tools/KB/permissions
  - Uses `@modelcontextprotocol/sdk` v1.x with stdio transport
  - `npm run mcp` script and `agent-scorecard-mcp` bin entry

### Limitations

- Only instruction-level checks are possible via `get_agent` (tools, KB, permissions, triggers, skills not exposed)
- 11 of 28 rules covered; 12 rules and all simulation probes excluded
- LLM check quality depends on monday's underlying model infrastructure

## 1.1.0

- Embedded monday.com BoardView app with API-based agent fetching
- Export to Board via monday GraphQL API
- LLM review checks (LR-001–LR-005) via Anthropic API
- Simulation probes (6 adversarial checks)

## 1.0.0

- Initial release: CLI with 28 deterministic audit rules
- SLED Grant vertical rule pack
- JSON and CLI table output formats
- Severity-weighted scoring with grade calculation
- OWASP ASI mapping
- JSON Schema for agent config validation
