# Agent Quality Scorecard

Deterministic configuration audit for monday.com Agent Builder agents. Ships as both a **monday.com embedded app** (fetches agent configs via API — zero export/upload) and a **CLI** for local/CI use. Produces a scored report with fix recommendations, OWASP ASI mappings, and optional adversarial simulation probes.

## Why

Agent Builder has no quality gate before deployment. Tier 3 (customer-built) agents have caused hallucinations, runaway token loops, confidential data leaks, and silent malfunctions. This tool catches configuration issues before they reach production.

## monday.com App (Primary Interface)

The embedded app runs inside monday.com — no JSON export required. It calls the internal Agent Management API, maps the response, runs the audit, and renders the scorecard inline.

The app is built with Vite and uses the monday SDK loaded via CDN. On mount it calls `monday.init()` to establish the host handshake, then fetches the current user's agents through the session-authenticated API.

```bash
npm run build:app      # Build to dist-app/
```

## Agent Builder (Agent-as-Auditor)

The Scorecard Agent runs natively inside monday.com as an Agent Builder agent. It uses `get_agent` to fetch a target agent's configuration, runs 7 deterministic instruction checks and 4 LLM-powered semantic reviews using its own reasoning, calculates a severity-weighted score and letter grade, and writes all findings to a monday.com board.

This covers a subset of the full rule set (11 of 28 rules) — specifically the instruction-level checks that don't require tool, KB, or permission data. No API key or external service is needed; the agent IS the LLM.

- **Full spec:** [`AGENT_BUILDER_V1_SPEC.md`](AGENT_BUILDER_V1_SPEC.md)
- **Setup guide:** [`docs/AGENT_BUILDER_SETUP.md`](docs/AGENT_BUILDER_SETUP.md)

## CLI

The CLI operates on exported agent config JSON files, useful for local debugging and CI gating.

```bash
npm install
npm run build

npx tsx src/cli.ts audit --config tests/fixtures/bad-agent.json --vertical sled-grant
```

### Options

```
agent-scorecard audit
  --config <path>            Required. Path to agent config JSON file.
  --vertical <name>          Optional. Vertical rule pack (e.g., "sled-grant").
  --parent-config <path>     Optional. Parent agent config for PM-002 inheritance check.
  --simulate                 Optional. Run adversarial simulation probes.
  --format <type>            Optional. "cli" (default) or "json".
  --output <path>            Optional. Write JSON report to file instead of stdout.
```

### Examples

```bash
# CLI table output (default)
npx tsx src/cli.ts audit --config agent.json

# With SLED vertical rules
npx tsx src/cli.ts audit --config agent.json --vertical sled-grant

# JSON output with simulation
npx tsx src/cli.ts audit --config agent.json --simulate --format json --output report.json

# Child agent with parent comparison
npx tsx src/cli.ts audit --config child.json --parent-config parent.json
```

Exit code `1` when deployment recommendation is `not-ready`; `2` on config load error.

## Audit Rules

28 rules across 8 categories. Universal rules always run; vertical rules run when `--vertical` is specified.

### Universal (24 rules)

| Rule | Severity | Category | Description |
|------|----------|----------|-------------|
| KB-001 | Critical | Knowledge Base | KB must have at least one file |
| KB-002 | Warning | Knowledge Base | Files should be relevant to agent goal |
| KB-003 | Info | Knowledge Base | Files should not be stale (>90 days) |
| PM-001 | Critical | Permissions | No workspace-wide permissions when narrower scope works |
| PM-002 | Warning | Permissions | Child agent permissions should not exceed parent |
| TL-001 | Warning | Tools | Flag tools unnecessary for agent purpose |
| TL-002 | Critical | Tools | All enabled tools must be connected |
| TR-001 | Critical | Triggers | Self-trigger loop detection (column change → same column modified) |
| TR-002 | Warning | Triggers | Trigger events should match agent purpose |
| IN-001 | Warning | Instructions | Instruction length between 100–10,000 chars |
| IN-002 | Critical | Instructions | Must contain guardrail keywords |
| IN-003 | Warning | Instructions | Should contain error-handling guidance |
| IN-004 | Warning | Instructions | Should define scope boundaries |
| EF-001 | Warning | Efficiency | Instructions should not contain repeated phrases |
| EF-002 | Warning | Efficiency | Agents with many tools need adequate instructions |
| EF-003 | Critical | Efficiency | Skills should not reference each other in a cycle |
| EF-004 | Info | Efficiency | Instructions should have high information density |
| EF-005 | Info | Efficiency | KB files should not have highly similar names |
| SC-001 | Critical | Security | Instructions must defend against prompt injection |
| SC-002 | Critical | Security | Read+write agents must have data handling restrictions |
| SC-003 | Warning | Security | Account-level agents with many tools need human-in-the-loop |
| SC-004 | Warning | Security | Sensitive column writes need write-guard instructions |
| SC-005 | Critical | Security | External web access tools must have URL restrictions |
| SC-006 | Warning | Security | Board-writing agents should validate output before writing |

### SLED Grant Vertical (4 rules)

| Rule | Severity | Description |
|------|----------|-------------|
| SLED-001 | Critical | Instructions must mention deadline accuracy |
| SLED-002 | Critical | Instructions must prohibit fabrication of financial figures |
| SLED-003 | Warning | KB should include eligibility-related files |
| SLED-004 | Warning | Instructions should reference compliance terms (EDGAR, SAM.gov, etc.) |

## Simulation Probes

When `--simulate` is passed (CLI) or enabled in the app, six adversarial probes run against the config. Each yields a verdict of `resilient`, `partial`, or `vulnerable` with a resilience score.

| Probe | What it tests |
|-------|---------------|
| Prompt Injection | Defenses against instruction override attempts |
| Tool Misuse | Whether tools can be coerced beyond intended use |
| Scope Escape | Whether the agent can act outside its permission boundary |
| Hallucination | Susceptibility to fabricating data without KB grounding |
| Error Cascade | Whether failures in one step can cascade uncontrolled |
| Data Exfiltration | Whether sensitive data can be extracted via tools |

Overall score blends **60% config audit + 40% simulation resilience**. A `vulnerable` probe verdict triggers the same grade cap as a failed critical rule.

## Scoring

- **Weights:** Critical = 3, Warning = 2, Info = 1
- **Score:** (sum of passed weights / sum of all weights) × 100
- **Hard fail:** Any critical failure caps grade at C
- **Grades:** A (90–100) → ready, B (75–89) → needs-fixes, C (60–74) → needs-fixes, D (40–59) → not-ready, F (0–39) → not-ready

## OWASP ASI Mapping

| OWASP ASI | Risk | Rules |
|-----------|------|-------|
| ASI-01 | Agent Goal Hijack | IN-002, IN-004, SC-001 |
| ASI-02 | Tool Misuse | TL-001, TL-002, SC-003 |
| ASI-03 | Identity & Privilege Abuse | PM-001, PM-002 |
| ASI-04 | Data Exfiltration | SC-002, SC-005 |
| ASI-08 | Cascading Failures | TR-001, TR-002, EF-003 |

## JSON Report Contract

When using `--format json`, the output follows the `ScorecardReport` interface defined in [`src/config/types.ts`](src/config/types.ts). The `layers.configAudit` object contains:

| Field | Meaning |
|-------|---------|
| `totalChecks` | Number of rules executed |
| `passed` | Rules that passed |
| `failed` | Failed checks with severity **critical** |
| `warnings` | Failed checks with severity **warning** |
| `infoIssues` | Failed checks with severity **info** |
| `results` | Full `AuditResult[]` array |

**Invariant:** `passed + failed + warnings + infoIssues === totalChecks`

When `--simulate` is included, `layers.simulation` is also present with `overallResilience`, probe counts, and per-probe results.

## Agent Config Schema

The CLI expects a JSON file matching the `AgentConfig` interface. See [`src/config/types.ts`](src/config/types.ts) for the full schema and [`tests/fixtures/`](tests/fixtures/) for examples.

A JSON Schema definition is also available at [`schemas/agent-config.schema.json`](schemas/agent-config.schema.json) — maintained in-repo until monday publishes an official export schema.

## API Mapper

The embedded app fetches agents from `GET /monday-agents/agent-management/agents-by-user` and converts the response via `mapApiResponseToConfig()` in [`src/mapper/api-to-config.ts`](src/mapper/api-to-config.ts). The internal API types are defined in [`src/mapper/api-types.ts`](src/mapper/api-types.ts).

## Development

```bash
npm run build           # TypeScript compile (CLI + library)
npm run build:app       # Vite build (monday.com app → dist-app/)
npm test                # Run all tests (vitest)
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage
npm run lint            # Type-check
npm run prettier:check  # Format check
npm run verify          # Full CI-equivalent: lint + prettier + test + validate:schema
```

## Fixtures

Test fixtures in [`tests/fixtures/`](tests/fixtures/) should mirror sanitized real Agent Builder exports. When the Builder export shape changes:

1. Update fixtures to match the new shape.
2. Update [`schemas/agent-config.schema.json`](schemas/agent-config.schema.json) accordingly.
3. Run `npm run validate:schema` to confirm alignment.

## Project Structure

```
src/
├── cli.ts                          # CLI entry point
├── index.ts                        # Library entry point
├── config/
│   ├── types.ts                    # AgentConfig, AuditRule, ScorecardReport
│   ├── constants.ts                # Keyword lists, thresholds, weights
│   └── loader.ts                   # JSON loader with validation
├── auditors/
│   ├── runner.ts                   # Orchestrates all auditors
│   ├── auditor-utils.ts            # Shared utility functions
│   ├── knowledge-base-auditor.ts   # KB-001 – KB-003
│   ├── permission-auditor.ts       # PM-001 – PM-002
│   ├── tool-auditor.ts             # TL-001 – TL-002
│   ├── trigger-auditor.ts          # TR-001 – TR-002
│   ├── instruction-auditor.ts      # IN-001 – IN-004
│   ├── efficiency-auditor.ts       # EF-001 – EF-005
│   ├── security-auditor.ts         # SC-001 – SC-006
│   └── sled-auditor.ts             # SLED-001 – SLED-004
├── scoring/
│   └── aggregator.ts               # Weighted scoring + grade calculation
├── simulation/
│   ├── simulator.ts                # Orchestrates all probes
│   ├── types.ts                    # SimulationProbe, SimulationSummary
│   └── probes/                     # 6 adversarial probes
├── mapper/
│   ├── api-types.ts                # Internal API response types
│   └── api-to-config.ts            # API response → AgentConfig
├── helpers/
│   └── text-analysis.ts            # Shared text utilities
├── report/
│   ├── config-audit-summary.ts     # Config layer summary rollup
│   └── simulation-summary.ts       # Simulation layer summary
├── output/
│   ├── cli-reporter.ts             # Colored terminal table
│   └── json-reporter.ts            # JSON serialization
└── app/                            # monday.com embedded app (Vite + React)
    ├── index.html                  # Entry HTML (loads monday SDK via CDN)
    ├── app.tsx                     # Root component (monday.init + audit flow)
    ├── hooks/                      # useAgentConfig, useAudit
    └── components/                 # AgentPicker, ScoreCard, RuleResults, etc.
```

## Security Considerations

The `--config` and `--parent-config` arguments read any file path accessible to the
current process. This is safe for local CLI usage but would be a path traversal risk
if the tool were exposed as a network service. If you plan to run agent-scorecard
behind an HTTP endpoint, sanitize and restrict config paths before passing them to
`loadConfig()`.
