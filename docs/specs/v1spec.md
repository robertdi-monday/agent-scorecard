# Agent Scorecard — V1 codebase specification

**Purpose:** Single in-repo source of truth for what this project is, how it is structured, how data flows, and how to extend or operate it. Written for the maintainer and for AI-assisted sessions that need deep catch-up without re-deriving the architecture from scratch.

**Scope:** The state of the repository as documented here reflects the codebase at the time this file was authored (documentation-only “V1 lock-in”; npm `package.json` version may differ).

**Related docs:** [`README.md`](../../README.md), [`docs/AGENT_BUILDER_V1_SPEC.md`](../AGENT_BUILDER_V1_SPEC.md), [`docs/AGENT_BUILDER_SETUP.md`](../AGENT_BUILDER_SETUP.md), [`docs/ROADMAP.md`](../ROADMAP.md), [`docs/STANDARDS_AND_VALUE.md`](../STANDARDS_AND_VALUE.md), [`CHANGELOG.md`](../../CHANGELOG.md).

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Glossary](#2-glossary)
3. [Product surface](#3-product-surface)
4. [User journeys](#4-user-journeys)
5. [Architecture](#5-architecture)
6. [Data flow](#6-data-flow)
7. [Configuration contract](#7-configuration-contract)
8. [API surface](#8-api-surface)
9. [Audit rules and scoring rubric](#9-audit-rules-and-scoring-rubric)
10. [LLM review layer](#10-llm-review-layer)
11. [Simulation layer](#11-simulation-layer)
12. [Extension points](#12-extension-points)
13. [Testing strategy](#13-testing-strategy)
14. [Dependencies map](#14-dependencies-map)
15. [Security](#15-security)
16. [Error types and failure modes](#16-error-types-and-failure-modes)
17. [Known limitations](#17-known-limitations)
18. [Repository map (role of each area)](#18-repository-map-role-of-each-area)
19. [Operations and scripts](#19-operations-and-scripts)
20. [Doc index](#20-doc-index)

---

## 1. Executive summary

**agent-scorecard** is a TypeScript toolkit that audits **monday.com Agent Builder** agent configurations: deterministic rules over structured config + optional **adversarial simulation probes** + optional **LLM semantic review**. It ships as:

- A **library** (`src/index.ts` → published `dist/`) for programmatic audits and reporting.
- A **CLI** (`agent-scorecard` / `src/cli.ts`) for local runs and CI gates.
- An **MCP server** with **stdio** (`src/mcp/server.ts`) and **Streamable HTTP** (`src/mcp/http-server.ts`) transports.
- A **Vite + React embedded app** (`src/app/`) that runs inside monday.com and fetches agents via an internal session-authenticated endpoint when available, with JSON paste fallback.

The core value proposition: a **deployment-oriented quality gate** before agents reach production—scored output, OWASP ASI–tagged findings, recommendations, and explicit `deploymentRecommendation` (`ready` | `needs-fixes` | `not-ready`).

---

## 2. Glossary

| Term | Meaning |
|------|---------|
| **AgentConfig** | Canonical in-memory / JSON shape describing one agent (instructions, KB, tools, triggers, permissions, skills). Defined in `src/config/types.ts`. |
| **Audit rule** | A single deterministic check: metadata (`id`, `name`, `severity`, `category`, optional `pillar`, `owaspAsi`, `agentPromptSnippet`) plus a `check(config, context?) → AuditResult` function. |
| **Pillar** | One of: Completeness, Safety, Quality, Observability, Reliability. Rules with `pillar` set are evaluable from **instruction-level** data alone (v1 / `get_agent` surface). |
| **Full-mode rule** | Rule **without** `pillar`: requires tools, KB, permissions, triggers, or similar fields in `AgentConfig`. |
| **Instruction-only / v1 surface** | Predicate: rule has `pillar !== undefined`. Same idea as `isInstructionOnlyRule()` in `src/mcp/public-api-mapper.ts`. |
| **GOV-001** | Autonomy tier inference (`inferAutonomyTier`): tiers 1–4 from `kind` + heuristic “capability surface” in plan/user prompt; raises the score bar for `ready` via `tierAwareReady`. |
| **Block-on-critical** | Any failed **critical** deterministic rule forces grade **F** and `not-ready`, regardless of weighted score. Multi-layer scoring adds vulnerable probes and failed S-003 (defense quality LLM check). |
| **ScorecardReport** | JSON-serializable report: metadata, overall score/grade, optional pillar scores, `layers` (config audit, optional simulation, optional LLM review), `recommendations`. |
| **Vertical** | Optional named rule pack (e.g. `sled-grant`) appended to universal rules in `getRulesForVertical()`. |
| **Probe** | One simulation module implementing `SimulationProbe`: returns resilience score + verdict (`resilient` \| `partial` \| `vulnerable`). |
| **MCP** | Model Context Protocol; this repo uses `@modelcontextprotocol/sdk` to expose tools over stdio or HTTP. |
| **get_agent (public)** | monday MCP / public shape: goal, plan, user_prompt, kind, state, profile—**no** tools/KB/triggers/skills. Mapped by `mapPublicAgentToConfig`. |
| **SLED** | Vertical rules for grant-program style agents (`src/auditors/sled-auditor.ts`). |

---

## 3. Product surface

### 3.1 Problems addressed

- Agent Builder ships rich agents without a built-in **config quality gate**.
- Misconfiguration correlates with hallucinations, runaway loops, over-broad permissions, and data-handling mistakes.
- Security and procurement audiences benefit from **OWASP Agentic Security Initiative (ASI)** tags on findings.

### 3.2 Primary outputs

- **Per-rule results:** pass/fail, message, optional recommendation, evidence, OWASP tags.
- **Aggregate score** (0–100), **letter grade** (A–F), **deployment recommendation**.
- **Optional layers:** simulation resilience breakdown; LLM review scores and tailored fix snippets (Q-004).
- **Recommendations list:** sorted by priority, merge of config failures + LLM failures, with Q-004 tailored text overriding generic `howToFix` where applicable.

### 3.3 Delivery modes (who uses what)

| Mode | Typical user | Input config source |
|------|--------------|---------------------|
| Embedded app | monday user in iframe | `/monday-agents/.../agents-by-user` → `mapApiResponseToConfig`, or pasted JSON |
| CLI / CI | engineer | `--config` JSON file (+ optional `--parent-config`) |
| MCP stdio | Agent Builder custom tool / local client | Caller passes JSON string; may be `get_agent` output |
| MCP HTTP | hosted integration | Same + optional `get_agent` / `list_agents` / `monday_tool` when `MONDAY_API_TOKEN` set |

---

## 4. User journeys

### 4.1 Engineer: audit a fixture locally (full rules)

```
Install deps → build → run CLI with JSON fixture
```

1. `npm install && npm run build`
2. `npx tsx src/cli.ts audit --config tests/fixtures/<file>.json`
3. Optional: `--vertical sled-grant`, `--parent-config parent.json`, `--simulate`, `--llm-review` (+ key), `--format json --output report.json`
4. Exit code: `0` unless `deploymentRecommendation === 'not-ready'` → `1`, or config load error → `2`.

### 4.2 Engineer: CI gate

1. Same as 4.1 with `--format json` and parsing `deploymentRecommendation` or grade.
2. `npm run verify` locally mirrors lint + prettier + tests + schema validation + generated spec check.

### 4.3 Operator: run MCP over HTTP with auth

1. Set `MCP_API_KEY`, optional `PORT`, `MONDAY_API_TOKEN`, `ANTHROPIC_API_KEY`.
2. `npm run mcp:http` or Docker image (`Dockerfile` runs `dist/mcp/http-server.js`).
3. Client sends `Authorization: Bearer <MCP_API_KEY>` (if key set); open mode if key unset (dev only).

### 4.4 monday user: embedded app

1. App loads; SDK/storage initialized (`app.tsx`).
2. `useAgentConfig` tries internal API fetch; on failure switches to **manual** mode (paste JSON).
3. User picks agent; `useAudit` runs `runAudit` + **always** `runSimulation`; if Anthropic key in storage, runs `runLlmReview` (failures non-blocking).
4. UI shows `ScoreCard`, `RuleResults`, simulation, optional LLM panel, recommendations, export affordances.

### 4.5 Agent Builder “Scorecard Agent” (out of band)

Instructions and provisioning are specified in `docs/AGENT_BUILDER_V1_SPEC.md` and generated from `src/agent-builder/agent-prompt.ts` / `build-agent-prompt.ts` via `npm run gen:spec`. The live agent is a **subset** of the full TS pipeline (instruction-focused checks + selected LLM checks as per that spec).

---

## 5. Architecture

### 5.1 Layered model

```
                    +------------------+
                    |  Inputs          |
                    |  JSON file / API |
                    |  / MCP string    |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |  Load / map      |
                    |  loader / mappers |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
     +----------------+            +----------------+
     | runAudit()     |            | (optional)     |
     | all AuditRules |            | runSimulation  |
     +--------+-------+            +--------+-------+
              |                             |
              +-------------+---------------+
                            |
              +-------------+---------------+
              |                             |
              v                             v
     +----------------+            +----------------+
     | summarize +    |            | (optional)     |
     | calculateScore |            | runLlmReview   |
     +--------+-------+            +--------+-------+
              \                             /
               \                           /
                v                         v
                    +------------------+
                    |  Aggregator      |
                    |  multi-layer     |
                    |  + GOV-001 (CLI/ |
                    |    MCP paths)    |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |  Report + output |
                    |  CLI / JSON / UI |
                    +------------------+
```

### 5.2 Design principles (as embodied in code)

- **Deterministic first:** most checks are pure functions of `AgentConfig` (+ optional `parentConfig`).
- **Explicit severity weights** in `src/config/constants.ts` (critical > warning > info).
- **Strict blockers:** critical failures and certain cross-layer conditions force **F** / `not-ready`.
- **MCP partial config:** when tools, KB files, triggers, and skills are all empty, MCP filters results to rules that have `pillar` set, avoiding false failures on full-mode-only rules.

### 5.3 Key modules

| Module | Responsibility |
|--------|----------------|
| `config/types.ts` | All shared interfaces: `AgentConfig`, `AuditRule`, `AuditResult`, report types. |
| `config/loader.ts` | Parse + validate JSON into `AgentConfig`; throws `ConfigLoadError`. |
| `config/constants.ts` | Version string, weights, thresholds, keyword lists, tier thresholds. |
| `auditors/runner.ts` | Compose `BASE_RULES` + vertical rules; `runAudit`. |
| `scoring/aggregator.ts` | Weighted scores, grades, recommendations, multi-layer blend. |
| `scoring/autonomy-tier.ts` | GOV-001 tier + `tierAwareReady`. |
| `simulation/simulator.ts` | Run all probes, rollup summary. |
| `llm-review/reviewer.ts` | Phase 1 parallel checks + Phase 2 Q-004. |
| `report/*` | Thin rollups for config and simulation layers. |
| `output/*` | CLI table formatting vs JSON string. |
| `mcp/*` | MCP transports, monday API client, public API mapping. |
| `mapper/*` | Internal REST response → `AgentConfig` for the app. |
| `agent-builder/*` | Composed prompt text for provisioned Scorecard Agent + spec sync. |

---

## 6. Data flow

### 6.1 CLI audit pipeline (ASCII)

```
  [agent.json] ----read----> loadConfig()
                                  |
                                  v
                           AgentConfig
                                  |
            +---------------------+---------------------+
            |                                           |
            v                                           v
      runAudit(config, vertical?, ctx)          (opt) loadConfig(parent)
            |                                           |
            |                                           v
            |                                    context.parentConfig
            v                                           |
      AuditResult[] <-----------------------------------+
            |
            +--> summarizeConfigAuditLayer()
            +--> calculateScore()  [single-layer]
            |
            +--> (if --simulate) runSimulation(config) --> SimulationSummary
            |
            +--> (if --llm-review) runLlmReview(...) --> LlmReviewSummary
            |
            v
      calculateOverallScore(multiLayer)   [when sim or LLM present]
            +
            +--> inferAutonomyTier + tierAwareReady --> finalRecommendation
            v
      ScorecardReport --> formatCliReport / formatJsonReport
```

### 6.2 MCP `audit_agent` string input

1. `JSON.parse(agentConfigJson)`.
2. If shape looks like public agent (`user_prompt` + `profile`, optionally wrapped in `{ agent }`), `mapPublicAgentToConfig`.
3. Else `loadConfig(parsed)` for full validation.
4. `runAudit(config)` then possibly **filter** to `results.filter(r => r.pillar !== undefined)` when `!hasFullConfig(config)` (`hasFullConfig` = any of tools length, KB files, triggers length, skills length > 0).
5. Optional simulation / LLM same as CLI (stdio: LLM errors return `isError` content; HTTP: missing LLM key logs and skips LLM layer).

### 6.3 Embedded app

```
fetch('/monday-agents/agent-management/agents-by-user')
        --> InternalAgentResponse[]
        --> mapApiResponseToConfig() --> AgentConfig[]
        --> user selects --> useAudit(config, apiKey?)
```

`useAudit` always includes simulation; LLM is best-effort if key present; **does not** currently apply `inferAutonomyTier` / `tierAwareReady` to the report metadata or final recommendation (see limitations).

---

## 7. Configuration contract

### 7.1 `AgentConfig` (canonical)

See `src/config/types.ts`. Required conceptual groups:

- **Identity:** `agentId`, `agentName`, `kind`, `state`.
- **Instructions:** `goal`, `plan`, `userPrompt` (loader allows missing `userPrompt` in JSON and coerces to `''`).
- **Knowledge base:** `knowledgeBase.files[]` with `fileName`, `sourceType`, optional `lastUpdated` (ISO).
- **Tools:** `name`, `displayName`, `type` (`builtin` \| `custom` \| `app-feature` \| `mcp`), `connectionStatus`, `enabled`, optional `modifiesColumns`.
- **Triggers:** `name`, `blockReferenceId`, `triggerType`, `triggerConfig` object.
- **Permissions:** `scopeType` (`workspace` \| `board` \| `custom`), `connectedBoards`, `connectedDocs`, optional `parentAgentId`.
- **Skills:** array of `{ id, name, description }` (defaulted to `[]` if absent in JSON).

### 7.2 Validation behavior (`loadConfig`)

- File path: read UTF-8 → JSON parse → validate; failures throw **`ConfigLoadError`** with actionable messages.
- Object input: validate in-memory (used by MCP after parse).
- Enums and required strings are strictly checked; `skills` may default to `[]`.

### 7.3 JSON Schema

`schemas/agent-config.schema.json` is the declarative contract for fixtures and external validators. `npm run validate:schema` runs `scripts/validate-fixtures.mjs` against fixtures.

### 7.4 Public `get_agent` mapping

`mapPublicAgentToConfig` fills **empty** `tools`, `knowledgeBase.files`, `triggers`, `skills`, and minimal `permissions` (`scopeType: 'custom'`, empty arrays). That empty envelope triggers MCP’s instruction-only filtering.

### 7.5 Generated agent prompt sync

- **Source of truth for Scorecard Agent user prompt body:** `src/agent-builder/agent-prompt.ts` (composed text) and `src/agent-builder/build-agent-prompt.ts` (builder that pulls `agentPromptSnippet` from rules + selected LLM checks).
- **`npm run gen:spec`** rewrites the fenced block in `docs/AGENT_BUILDER_V1_SPEC.md` between `<!-- AUTO-GEN:AGENT_PROMPT START/END -->`.
- **`npm run gen:spec:check`** fails CI if spec drifts.

---

## 8. API surface

### 8.1 Library exports (`src/index.ts`)

**Functions:** `loadConfig`, `runAudit`, `getRulesForVertical`, scoring and reporting helpers, `runSimulation`, `inferAutonomyTier`, `tierAwareReady`, `mapApiResponseToConfig`, `runLlmReview`, `createAnthropicClient`, `extractJson`, `completeJson`, text helpers, formatters, summarizers.

**Constants:** `SCORECARD_VERSION`, `ConfigLoadError` class.

**Types:** All primary interfaces from `config/types`, simulation types, aggregator inputs, mapper API types, LLM review types.

Consumers should treat `src/index.ts` as the **stable** programmatic surface; deep imports from subpaths are not part of the published contract unless documented.

### 8.2 CLI (`agent-scorecard audit`)

| Option | Effect |
|--------|--------|
| `--config <path>` | Required. JSON file. |
| `--vertical <name>` | Adds vertical rules (e.g. `sled-grant`). |
| `--parent-config <path>` | Loads parent `AgentConfig` into `AuditContext` for PM-002. |
| `--simulate` | Runs simulation; enables multi-layer scoring with sim weights. |
| `--llm-review` | Runs LLM checks; requires `--llm-api-key` or `ANTHROPIC_API_KEY`. |
| `--llm-model <id>` | Overrides default Anthropic model on the client wrapper. |
| `--format cli\|json` | Output channel. |
| `--output <path>` | Write JSON to file (json format). |

**Exit codes:** `1` = `not-ready`; `2` = config load / missing LLM key for `--llm-review`; uncaught errors propagate.

### 8.3 MCP stdio (`src/mcp/server.ts`)

| Tool | Description |
|------|-------------|
| `audit_agent` | Inputs: `agentConfigJson`, optional `includeLlmReview`, `includeSimulation`, `anthropicApiKey`. Returns JSON `ScorecardReport` as text content. Applies instruction-only filtering when partial config. **No** `vertical` parameter (always universal + no vertical in tool schema). |

### 8.4 MCP HTTP (`src/mcp/http-server.ts`)

| Tool | Notes |
|------|------|
| `audit_agent` | Same core pipeline; defaults `includeLlmReview` and `includeSimulation` to **true**; skips LLM if no API key with log line (non-fatal). |
| `get_agent` | Requires `MONDAY_API_TOKEN`; uses `createMcpApiClient`. |
| `list_agents` | Lists up to 100 summaries for token holder. |
| `monday_tool` | Proxy to monday MCP tools (`create_board`, etc.) with JSON `arguments` string. |

**HTTP transport:** Streamable HTTP from MCP SDK; auth via `authenticate()` comparing `Authorization` bearer to `MCP_API_KEY` (if empty, **open server**—dev only). Health endpoint and request logging exist for operability (see file for paths).

### 8.5 Embedded app (runtime)

- Not a published npm API; bundled by Vite.
- Fetches agents from relative URL `/monday-agents/agent-management/agents-by-user` with `credentials: 'include'` and `x-csrf-token` from meta or `window.__CSRF_TOKEN__`.

### 8.6 `ScorecardReport` shape (contract summary)

- `metadata`: agent id/name, optional `vertical`, ISO timestamp, `scorecardVersion`, `phasesRun`, `scoringWeights`, optional `autonomyTier` + `autonomyTierRationale` (when tier logic applied).
- `overallScore`, `overallGrade`, `pillarScores?`, `deploymentRecommendation`.
- `layers.configAudit`: nested score + counts + full `results`.
- `layers.simulation?`, `layers.llmReview?` when run.
- `recommendations`: sorted `Recommendation[]`.

**Invariant:** `passed + failed + warnings + infoIssues === totalChecks` for the config layer summary (see README).

---

## 9. Audit rules and scoring rubric

### 9.1 Rule inventory (deterministic)

Rules are registered in `src/auditors/runner.ts` in order:

| File | Rule IDs |
|------|----------|
| `knowledge-base-auditor.ts` | KB-001 – KB-003 |
| `permission-auditor.ts` | PM-001 – PM-002 |
| `tool-auditor.ts` | TL-001 – TL-002 |
| `trigger-auditor.ts` | TR-001 – TR-002 |
| `completeness-auditor.ts` | C-001, C-002, C-003, C-004, C-005, C-008 |
| `quality-auditor.ts` | Q-001 |
| `efficiency-auditor.ts` | EF-002, EF-003, EF-005 |
| `safety-auditor.ts` | S-001, S-002, S-006, S-008 |
| `security-auditor.ts` | SC-002 – SC-006 |
| `observability-auditor.ts` | O-001, O-002 |
| `reliability-auditor.ts` | R-001, R-002 |
| `sled-auditor.ts` (vertical) | SLED-001 – SLED-004 |

**Instruction-only rules:** exactly those with `pillar` set (15 rules across completeness, quality, safety, observability, reliability). These are the MCP-filtered set for public partial configs.

**Note:** There is no EF-001 or SC-001 in the current tree; README tables should be reconciled against this inventory when editing marketing copy.

### 9.2 Severity weights

From `SEVERITY_WEIGHTS` in `src/config/constants.ts`:

- critical = **10**
- warning = **3**
- info = **1**

Legacy `LEGACY_SEVERITY_WEIGHTS` exists for migration reference (3:2:1); CLI does not expose `--legacy-weights` in the current `cli.ts` snapshot—verify before documenting a flag.

### 9.3 Config-only score

For each rule, add weight to total; if passed, add weight to passed sum.

```
score = round( (passedWeight / totalWeight) * 100, 1 decimal )
```

Then:

- `scoreToGrade` using thresholds: A >= 90, B >= 75, C >= 60, D >= 40, else F.
- **Block-on-critical:** any failed critical → grade **F** (overrides numeric band).
- `gradeToRecommendation`: A → `ready`; B/C → `needs-fixes`; D/F → `not-ready`.

### 9.4 Multi-layer weights (`deriveScoringWeights`)

| Layers present | Config | Simulation | LLM |
|----------------|--------|------------|-----|
| Config only | 100% | — | — |
| Config + simulation | 60% | 40% | — |
| Config + simulation + LLM | 40% | 30% | 30% |

`calculateOverallScore`:

- Blends numeric scores from each present layer.
- Sets `hasCriticalFailure` if: any critical config failure **or** any simulation verdict `vulnerable` **or** LLM check **S-003** failed.
- Any such critical composite → grade **F**.

### 9.5 GOV-001 tier-aware readiness

After grade/score from aggregator, **CLI and MCP** call:

- `inferAutonomyTier(config)` → tier 1–4 + rationale.
- `tierAwareReady(tier, score, grade)`:

  - If grade is **F** → never “tier ready.”
  - Else require numeric score ≥ threshold: tier 1 → 75, 2 → 80, 3 → 85, 4 → 90 (`TIER_AWARE_READY_THRESHOLDS`).

If base recommendation is `ready` but tier gate fails → **`needs-fixes`** (not `not-ready`).

### 9.6 Pillar scores

`calculatePillarScores` buckets `AuditResult` rows by `pillar` (or rule-id prefix fallback), then applies the same severity weights per pillar. LLM results are **synthesized** into `AuditResult`-like rows for bucketing when the check id prefix maps to a pillar.

---

## 10. LLM review layer

### 10.1 Orchestration (`src/llm-review/reviewer.ts`)

- **Phase 1:** parallel `Promise.all` over `PHASE_1_CHECKS` (9 checks).
- **Phase 2:** `runTailoredRecommendations` (Q-004) serial, consuming phase 1 outputs + `failedRules` + `simulationGaps`.
- Per-check errors become failing `LlmReviewResult` with evidence error string (phase 1); Q-004 errors still return a passing placeholder with message about generation failure (phase 2).
- **Overall LLM score:** average of phase-1 scores only (Q-004 excluded as info / always-pass semantics).

### 10.2 Check IDs (public / report)

| Check module | Report `checkId` | Notes |
|--------------|------------------|------|
| `lr-001-instruction-coherence.ts` | Q-002 | Coherence |
| `lr-002-defense-quality.ts` | S-003 | Sampled judges; **critical**; drives multi-layer critical if failed |
| `lr-003-tool-goal-alignment.ts` | Q-003 | |
| `lr-004-kb-relevance.ts` | LR-004 | Orchestrator / KB angle |
| `lr-005-tailored-recommendations.ts` | Q-004 | Tailored fixes |
| `lr-006-tool-output-trust.ts` | S-004 | Sampled |
| `lr-007-defense-positioning.ts` | S-005 | Sampled |
| `lr-008-refusal-concreteness.ts` | S-007 | Sampled |
| `lr-009-persona-drift.ts` | S-009 | Sampled (k=5) |
| `lr-010-goal-specificity.ts` | C-007 | |

### 10.3 Client (`src/llm-review/llm-client.ts`)

- `createAnthropicClient` for Anthropic Messages API.
- Helpers `extractJson`, `completeJson` for structured extraction.

### 10.4 Multi-judge confidence

Sampled checks stash `_samples` / `_variance` in evidence; `annotateConfidence` in `reviewer.ts` promotes them to `samples`, `variance`, `lowConfidence` on the result using `LOW_CONFIDENCE_VARIANCE_THRESHOLD` from constants.

---

## 11. Simulation layer

**Entry:** `runSimulation(config)` in `src/simulation/simulator.ts`.

**Probes (fixed order):**

1. `probes/prompt-injection.ts`
2. `probes/tool-misuse.ts`
3. `probes/scope-escape.ts`
4. `probes/hallucination.ts`
5. `probes/error-cascade.ts`
6. `probes/data-exfiltration.ts`

Each returns `SimulationResult` (`verdict`, `resilienceScore`, `gaps`, `defenseFound`, etc.). **Vulnerable** verdict participates in multi-layer critical failure path.

---

## 12. Extension points

### 12.1 Add a deterministic audit rule

1. Choose auditor file (or create a new auditor module if the domain is new).
2. Export an `AuditRule` object: unique `id`, human-readable `name`/`description`, `severity`, `category`, optional `pillar` (if instruction-only), optional `owaspAsi`, optional `agentPromptSnippet` (for Scorecard Agent prompt sync).
3. Append to the appropriate exported array; ensure `runner.ts` imports and spreads it into `BASE_RULES` or a vertical map.
4. Add **tests** under `tests/auditors/` or `tests/fixtures/per-rule/`.
5. If instruction-only, update Agent Builder prompt expectations and run `npm run gen:spec`.

### 12.2 Add a vertical

1. Create `src/auditors/<name>-auditor.ts` exporting `AuditRule[]`.
2. Register in `VERTICAL_RULES` in `runner.ts`.
3. Document in README + this spec.

### 12.3 Add an LLM check

1. Implement `LlmReviewCheck` in `src/llm-review/checks/lr-NNN-*.ts`.
2. Register in `PHASE_1_CHECKS` (or integrate into phase 2 if it must run after others).
3. Wire pillar / OWASP on the check object for pillar score bucketing.
4. Add tests with `tests/llm-review/mock-client.ts`.

### 12.4 Add a simulation probe

1. Implement `SimulationProbe` in `src/simulation/probes/*.ts`.
2. Append to `ALL_PROBES` in `simulator.ts`.
3. Add `simulation/simulator.test.ts` coverage or dedicated probe tests.

### 12.5 Add MCP tool / HTTP route

Extend `http-server.ts` / `server.ts` with `server.registerTool(...)` following existing Zod `inputSchema` patterns; keep auth and logging consistent.

---

## 13. Testing strategy

### 13.1 Runner

**vitest** (`npm test`, `npm run test:watch`, `npm run test:coverage`).

### 13.2 Test layout (representative)

| Area | Location |
|------|----------|
| Config load / errors | `tests/config/loader.test.ts` |
| Per-auditor behavior | `tests/auditors/*.test.ts` |
| Runner composition | `tests/auditors/runner.test.ts` |
| Scoring | `tests/scoring/*.test.ts` |
| Simulation | `tests/simulation/simulator.test.ts` |
| LLM review | `tests/llm-review/**/*.test.ts` (mock client, sampled paths) |
| Mappers | `tests/mapper/api-to-config.test.ts` |
| Schema parity | `tests/schema-parity.test.ts` |
| Fixtures / incidents | `tests/fixtures/**` |
| CLI E2E | `tests/cli.e2e.test.ts` |
| Library exports | `tests/library-entrypoint.test.ts` |
| Agent prompt builder | `tests/agent-builder/build-agent-prompt.test.ts` |

### 13.3 Non-unit scripts

- `scripts/test-e2e-mcp.ts`, `scripts/test-e2e-http-mcp.ts`, `scripts/test-mcp-pipeline.ts` — integration helpers (may need env + network).
- `scripts/provision-agent.ts`, `scripts/provision-hanna-test-agent.ts` — live provisioning against monday MCP.

### 13.4 Quality gate command

`npm run verify` = `lint` + `prettier:check` + `test` + `validate:schema` + `gen:spec:check`.

---

## 14. Dependencies map

### 14.1 Runtime (`dependencies`)

| Package | Role |
|---------|------|
| `@modelcontextprotocol/sdk` | MCP server + transports |
| `zod` | MCP tool input schemas |
| `commander` | CLI parsing |
| `chalk` | CLI colors |
| `cli-table3` | CLI tabular layout |

### 14.2 Development (`devDependencies`)

| Package | Role |
|---------|------|
| `typescript` / `tsx` | Compile + script runner |
| `vitest` / `@vitest/coverage-v8` | Tests + coverage |
| `prettier` | Formatting |
| `vite` / `@vitejs/plugin-react` / `react` / `react-dom` | Embedded app build |
| `monday-sdk-js` | Types / SDK usage in app context |
| `ajv` / `ajv-formats` | JSON schema validation scripts |

### 14.3 Node engine

`package.json` specifies **Node >= 20**. Docker image uses `node:20-slim`.

### 14.4 External services (optional)

- **Anthropic API** — LLM review when key provided.
- **monday.com MCP** (`mcp.monday.com`) — used by `createMcpApiClient` in `monday-api.ts` for HTTP server tools and provisioning scripts.

---

## 15. Security

### 15.1 Secrets and storage

| Secret | Where used |
|--------|------------|
| `ANTHROPIC_API_KEY` | CLI `--llm-api-key` override; MCP; app stores user key in **monday instance storage** (`ApiKeySettings` / `app.tsx`) |
| `MONDAY_API_TOKEN` | HTTP MCP `get_agent`, `list_agents`, `monday_tool`; provisioning scripts |
| `MCP_API_KEY` | HTTP MCP bearer auth |

**Risks:**

- HTTP MCP with **empty** `MCP_API_KEY` accepts all requests (intentional dev ergonomics; dangerous in production).
- Embedded app persists API key in monday storage—treat as sensitive user data.

### 15.2 CLI filesystem

`loadConfig` reads arbitrary paths from the local process—fine for local CLI; unsafe if a network wrapper passes unvalidated paths (path traversal / arbitrary read). README calls this out.

### 15.3 Data sent to third parties

LLM review sends instruction text and structured prompts to **Anthropic**. Logs on HTTP MCP may include agent names and timing (avoid logging full payloads in shared environments).

### 15.4 Agent-as-auditor hardening

`agent-prompt.ts` / spec emphasize: evaluated agent text is **DATA**, identity pinning, no fabricated scores. Aligns with OWASP ASI prompt-injection themes.

### 15.5 Supply chain / platform

ASI-04 is noted in README as future work; KB file naming heuristics partially substitute. RCE class risks are called out of scope for Agent Builder config surface.

---

## 16. Error types and failure modes

| Kind | Type / signal | Typical cause | User-visible behavior |
|------|----------------|---------------|------------------------|
| Config read | `ConfigLoadError` | Missing file, unreadable path | CLI stderr + exit **2** |
| JSON parse | `ConfigLoadError` | Invalid JSON | Same |
| Schema validation | `ConfigLoadError` | Missing `agentId`, bad enum, wrong array shapes | Same |
| CLI LLM missing key | process exit **2** | `--llm-review` without key | Error message |
| Audit not-ready | exit **1** | Failed critical / grade D–F / composite critical | CLI table / JSON `deploymentRecommendation` |
| MCP parse | thrown `Error('Invalid JSON...')` | Bad `agentConfigJson` | Tool result `isError: true` |
| MCP LLM missing key (stdio) | not thrown | No key when `includeLlmReview` | `isError: true` text response |
| MCP LLM missing key (HTTP) | non-fatal | Default include LLM true, no key | Deterministic-only scoring; log line |
| LLM per-check failure | caught in reviewer | API/network/model | Failing result row with `evidence.error` |
| LLM review catastrophic (app) | caught in `useAudit` | Throws before layer built | LLM layer omitted; audit still shown |
| monday API / MCP proxy | `isError` tool content | Missing token, API error | Message in tool result |
| App agent fetch | thrown in hook | 401/403/HTML body | Falls back to manual JSON mode |

---

## 17. Known limitations

1. **MCP stdio `audit_agent`** has no `vertical` parameter—cannot activate SLED via MCP without code change.
2. **Embedded app `useAudit`** does not apply **GOV-001** (`inferAutonomyTier` / `tierAwareReady`) or populate `metadata.autonomyTier*`; recommendation may differ from CLI for high-tier agents.
3. **`hasFullConfig` heuristic:** Uses non-empty tools **or** KB files **or** triggers **or** skills. A legitimately empty-tool agent with populated permissions-only still looks “partial” and may filter rules incorrectly—edge case for synthetic configs.
4. **README vs code:** Rule counts / IDs in README should be reconciled (e.g. EF-001/SC-001 references, LLM cost table vs exact check list).
5. **Simulation + LLM cost:** Full passes can be expensive; HTTP defaults enable both.
6. **`get_agent` public surface** lacks tools/KB—full deterministic suite requires internal API or full JSON export.
7. **Browser vs Node:** `constants.ts` uses `define` for `__SCORECARD_VERSION__` in Vite builds vs `createRequire` for Node.
8. **E2E scripts** require real tokens/network—not run in default `npm test`.

---

## 18. Repository map (role of each area)

### 18.1 Top level

| Path | Role |
|------|------|
| `package.json` | Package metadata, scripts, `bin` entries for CLI + MCP. |
| `tsconfig.json` | Compiler options for library + servers. |
| `vite.config.app.ts` | Vite build for embedded app → `dist-app/`. |
| `Dockerfile` | Multi-stage build; runs HTTP MCP on port 3001. |
| `schemas/agent-config.schema.json` | JSON Schema for `AgentConfig`. |
| `README.md` | User-facing overview, rule tables, run instructions. |
| `CHANGELOG.md` | Release history. |
| `AGENT_USER_PROMPT_FOR_MONDAY.txt` | Scratch / handoff artifact (not imported by code—verify before treating as canonical). |

### 18.2 `src/` (production TypeScript)

| Path | Role |
|------|------|
| `cli.ts` | CLI entry (`agent-scorecard`). |
| `index.ts` | Library public API. |
| `config/types.ts` | Shared domain types. |
| `config/constants.ts` | Thresholds, weights, keyword corpora, version. |
| `config/loader.ts` | `loadConfig`, `ConfigLoadError`. |
| `auditors/*.ts` | All deterministic rules + `runner.ts`. |
| `auditors/auditor-utils.ts` | Shared helpers (e.g. `matchKeyword`). |
| `scoring/aggregator.ts` | Scoring, grades, recommendations, multi-layer. |
| `scoring/autonomy-tier.ts` | GOV-001. |
| `simulation/*` | Simulator + probe implementations + types. |
| `llm-review/*` | Reviewer, client, check modules, types. |
| `report/*` | Layer summarizers. |
| `output/*` | CLI and JSON reporters. |
| `helpers/text-analysis.ts` | Shared text utilities (exported from index). |
| `mapper/api-types.ts` | Internal API typings. |
| `mapper/api-to-config.ts` | Maps rich API response → `AgentConfig`. |
| `mcp/server.ts` | Stdio MCP + `audit_agent` only. |
| `mcp/http-server.ts` | HTTP MCP + extra monday tools + health. |
| `mcp/monday-api.ts` | Streamable HTTP client to monday MCP. |
| `mcp/public-api-mapper.ts` | `get_agent` → `AgentConfig` + instruction-only helpers. |
| `agent-builder/agent-prompt.ts` | Canonical long prompt string fragments. |
| `agent-builder/build-agent-prompt.ts` | Composes prompt from rules + LLM check metadata. |
| `app/*` | React UI, hooks, components, monday config JSON, shims. |
| `app/services/export-to-board.ts` | Board export helper for UI. |

### 18.3 `tests/`

Vitest suites and fixtures mirroring real export shapes; `tests/fixtures/` is the practical contract for “realistic” configs.

### 18.4 `scripts/`

| Script | Role |
|--------|------|
| `validate-fixtures.mjs` | Ajv validation of fixtures vs schema. |
| `gen-spec.ts` | Sync agent prompt into `AGENT_BUILDER_V1_SPEC.md`. |
| `provision-agent.ts` | Create Scorecard Agent via monday MCP. |
| `provision-hanna-test-agent.ts` | Test agent provisioning variant. |
| `hanna-test-agent-content.ts` | Content helper for Hanna test agent. |
| `test-*.ts` | MCP / HTTP pipeline manual E2E harnesses. |

### 18.5 `docs/` (non-spec)

Roadmap, leadership briefs, standards, handoff notes, setup guides—see [Doc index](#20-doc-index).

---

## 19. Operations and scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | `tsc` → `dist/` |
| `npm run build:app` | Vite → `dist-app/` |
| `npm test` | Vitest |
| `npm run lint` | `tsc --noEmit` |
| `npm run verify` | Full local CI stack |
| `npm run mcp` | stdio MCP via `tsx src/mcp/server.ts` |
| `npm run mcp:http` | HTTP MCP |
| `npm run validate:schema` | Fixture/schema alignment |
| `npm run gen:spec` / `gen:spec:check` | Prompt/spec sync |

**Environment quick reference:**

- `PORT` — HTTP MCP (default 3001).
- `MCP_API_KEY` — HTTP MCP auth.
- `MONDAY_API_TOKEN` — monday MCP client for HTTP server tools + scripts.
- `ANTHROPIC_API_KEY` — LLM review.

---

## 20. Doc index

| Document | Contents |
|----------|----------|
| [`README.md`](../../README.md) | Quickstart, rule tables, MCP/CLI usage |
| [`docs/STANDARDS_AND_VALUE.md`](../STANDARDS_AND_VALUE.md) | Framework alignment, grading philosophy |
| [`docs/AGENT_BUILDER_V1_SPEC.md`](../AGENT_BUILDER_V1_SPEC.md) | Scorecard Agent product + auto-generated prompt |
| [`docs/AGENT_BUILDER_SETUP.md`](../AGENT_BUILDER_SETUP.md) | Operational setup for Agent Builder |
| [`docs/ROADMAP.md`](../ROADMAP.md) | Forward plan |
| [`docs/HANDOFF_PHASE_4.md`](../HANDOFF_PHASE_4.md) | Phase handoff notes |
| [`docs/LEADERSHIP_BRIEF_MONDAY_DOC.md`](../LEADERSHIP_BRIEF_MONDAY_DOC.md) | Executive narrative |
| **This file** | Codebase V1 architecture + contracts |

---

*End of V1 codebase specification.*
