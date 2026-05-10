# Agent Quality Scorecard

Deterministic configuration audit CLI for monday.com Agent Builder agents. Runs offline against an agent's exported JSON config and produces a scored report with fix recommendations and OWASP ASI mappings.

## Why

Agent Builder has no quality gate before deployment. Tier 3 (customer-built) agents have caused hallucinations, runaway token loops, confidential data leaks, and silent malfunctions. This tool catches configuration issues before they reach production.

## Quick Start

```bash
npm install
npm run build

# Run against a config file
npx tsx src/cli.ts audit --config tests/fixtures/bad-agent.json --vertical sled-grant
```

## Usage

```
agent-scorecard audit
  --config <path>        Required. Path to agent config JSON file.
  --vertical <name>      Optional. Vertical rule pack (e.g., "sled-grant").
  --format <type>        Optional. "cli" (default) or "json".
  --output <path>        Optional. Write JSON report to file instead of stdout.
```

### Examples

```bash
# CLI table output (default)
npx tsx src/cli.ts audit --config agent.json

# With SLED vertical rules
npx tsx src/cli.ts audit --config agent.json --vertical sled-grant

# JSON output to file
npx tsx src/cli.ts audit --config agent.json --format json --output report.json
```

## Audit Rules

17 rules across 6 categories. Universal rules always run; vertical rules run when `--vertical` is specified.

### Universal (13 rules)

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

### SLED Grant Vertical (4 rules)

| Rule | Severity | Description |
|------|----------|-------------|
| SLED-001 | Critical | Instructions must mention deadline accuracy |
| SLED-002 | Critical | Instructions must prohibit fabrication of financial figures |
| SLED-003 | Warning | KB should include eligibility-related files |
| SLED-004 | Warning | Instructions should reference compliance terms (EDGAR, SAM.gov, etc.) |

## Scoring

- **Weights:** Critical = 3, Warning = 2, Info = 1
- **Score:** (sum of passed weights / sum of all weights) × 100
- **Hard fail:** Any critical failure caps grade at C
- **Grades:** A (90–100) → ready, B (75–89) → needs-fixes, C (60–74) → needs-fixes, D (40–59) → not-ready, F (0–39) → not-ready

## OWASP ASI Mapping

| OWASP ASI | Risk | Rules |
|-----------|------|-------|
| ASI-01 | Agent Goal Hijack | IN-002, IN-004 |
| ASI-02 | Tool Misuse | TL-001, TL-002 |
| ASI-03 | Identity & Privilege Abuse | PM-001, PM-002 |
| ASI-08 | Cascading Failures | TR-001, TR-002 |

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

## Agent Config Schema

The CLI expects a JSON file matching the `AgentConfig` interface. See [`src/config/types.ts`](src/config/types.ts) for the full schema and [`tests/fixtures/`](tests/fixtures/) for examples.

A JSON Schema definition is also available at [`schemas/agent-config.schema.json`](schemas/agent-config.schema.json) — maintained in-repo until monday publishes an official export schema.

## Development

```bash
npm run build           # TypeScript compile
npm test                # Run all tests (vitest)
npm run test:watch      # Watch mode
npm run lint            # Type-check
npm run prettier:check  # Format check
npm run verify          # Full CI-equivalent: lint + prettier + build + test
```

## Fixtures

Test fixtures in [`tests/fixtures/`](tests/fixtures/) should mirror sanitized real Agent Builder exports. When the Builder export shape changes:

1. Update fixtures to match the new shape.
2. Update [`schemas/agent-config.schema.json`](schemas/agent-config.schema.json) accordingly.
3. Run `npm run validate:schema` to confirm alignment.

The JSON Schema is maintained in-repo until monday publishes an official export schema.

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
│   ├── knowledge-base-auditor.ts   # KB-001, KB-002, KB-003
│   ├── permission-auditor.ts       # PM-001, PM-002
│   ├── tool-auditor.ts             # TL-001, TL-002
│   ├── trigger-auditor.ts          # TR-001, TR-002
│   ├── instruction-auditor.ts      # IN-001, IN-002, IN-003, IN-004
│   └── sled-auditor.ts             # SLED-001 through SLED-004
├── scoring/
│   └── aggregator.ts               # Weighted scoring + grade calculation
├── report/
│   └── config-audit-summary.ts     # Layer summary rollup
└── output/
    ├── cli-reporter.ts             # Colored terminal table
    └── json-reporter.ts            # JSON serialization
```

## Security Considerations

The `--config` and `--parent-config` arguments read any file path accessible to the
current process. This is safe for local CLI usage but would be a path traversal risk
if the tool were exposed as a network service. If you plan to run agent-scorecard
behind an HTTP endpoint, sanitize and restrict config paths before passing them to
`loadConfig()`.
