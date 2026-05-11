# Agent Scorecard — Development Roadmap

**Last updated:** 2026-05-10

---

## v1.2.0 — Agent Builder (Instruction-Only)

**Status:** Spec complete, ready for Cursor implementation
**Delivery:** Agent Builder agent + monday.com board output
**Blocker:** None — ships with available data

### Scope

| Layer | What runs | Coverage |
|-------|-----------|----------|
| Deterministic | 7 rules (IN-001–004, EF-001, EF-004, SC-001) | 37% of full rule set |
| LLM Review | 4 checks (LR-001, LR-002 adapted, LR-003 adapted, LR-005) | 80% |
| Simulation | — | 0% |

### Deliverables

- Scorecard Agent created in Agent Builder with full instruction set
- Results board with columns: status, score, severity, category, finding, fix, OWASP, agent name/kind, grade
- One group per audit run, one item per finding, summary item with overall grade
- Severity-weighted scoring with critical failure cap (grade capped at C)

### Known limitations

- LLM checks rely on agent's own reasoning (no dedicated Claude Haiku call) — quality may be shallower than BoardView app
- LR-002 and LR-003 infer tools/permissions from plan text instead of actual config
- No tool/KB/permission/trigger data from `get_agent`
- No auto-trigger on agent creation or modification
- Manual invocation only (user provides agent ID)

---

## v1.3.0 — Full Config Access

**Status:** Blocked on internal API auth resolution
**Delivery:** Agent Builder agent with MCP tool proxy
**Blocker:** Internal REST API auth outside browser session context

### Goal

Restore all 19 deterministic rules + LR-004 (KB relevance) by giving the Scorecard Agent access to full agent configuration: tools, knowledge base, permissions, triggers, skills.

### Path to unblock

Two options (either works):

1. **MCP server proxy** — Lightweight server that calls `/monday-agents/agent-management/agents-by-user`, registered as an Agent Builder tool. Needs service account or internal token for auth. ~Half day infra work. This is the fastest path.

2. **`get_agent` API expansion** — Platform team adds tools/KB/permissions/triggers to the `get_agent` response. Right long-term answer but depends on platform roadmap.

### What gets restored

| Rule ID | Name | Why it was missing |
|---------|------|--------------------|
| EF-002 | Tool count ratio | Needs tool list |
| EF-003 | Circular skill dependencies | Needs skills |
| EF-005 | KB file relevance overlap | Needs KB files |
| SC-002 | Data exfiltration guard | Needs read + write tool detection |
| SC-003 | Excessive autonomy | Needs tool count (kind alone insufficient) |
| SC-004 | Sensitive column write guard | Needs tool metadata |
| SC-005 | External tool URL restrictions | Needs tool list |
| SC-006 | Output sanitization | Needs tool list |
| LR-004 | KB relevance | Needs KB file list |

### LLM check upgrades

- LR-002 gets real tool list + permissions for accurate blast radius assessment
- LR-003 gets real tool list instead of plan-text inference
- LR-005 generates fixes that reference actual tools by name

### Coverage target

| Layer | Coverage |
|-------|----------|
| Deterministic | 100% (19/19 rules) |
| LLM Review | 100% (5/5 checks) |
| Simulation | 0% (still blocked) |

---

## v1.4.0 — Simulation Layer

**Status:** Design phase
**Delivery:** Agent Builder agent with simulation probes
**Blocker:** Need tool execution capability + controlled probe environment

### Goal

Add the simulation layer — synthetic probe inputs that test how the agent actually behaves, not just what its instructions say.

### Probes

- Prompt injection probes (role hijacking, instruction override, context manipulation)
- Scope violation probes (requests outside stated boundaries)
- Error recovery probes (tool failure scenarios)
- Rate limit / retry behavior probes
- Data exfiltration probes (attempt to extract data via output channels)

### Architecture question

Simulation requires actually invoking the target agent with crafted inputs and observing responses. Options:

1. **Agent-to-agent invocation** — Scorecard Agent calls target agent via API. Requires agent invocation API (does this exist in Agent Builder?). Cleanest approach.
2. **Synthetic conversation replay** — Scorecard Agent constructs what the target agent WOULD do given its instructions + tools, using LLM reasoning. Less accurate but doesn't require actual invocation.
3. **Manual probe mode** — Scorecard Agent generates probe messages, user pastes them into target agent, copies response back. Low-tech but functional.

### Coverage target

| Layer | Coverage |
|-------|----------|
| Deterministic | 100% |
| LLM Review | 100% |
| Simulation | 100% |

Full three-layer scoring: Config Audit 40% + Simulation 30% + LLM Review 30%.

---

## v2.0.0 — Org-Wide Agent Health Dashboard

**Status:** Idea stage (noted 2026-05-10)
**Delivery:** Persistent dashboard or board view
**Blocker:** Batch agent enumeration + scheduling

### Goal

"How are the agents in my org doing?" — aggregate health view across all agents in an account.

### Features

- Enumerate all agents in account (requires account-level API access or admin permissions)
- Batch-run scorecard against every agent
- Aggregate dashboard: grade distribution, critical failure count, most common issues, trending scores over time
- Scheduled re-evaluation (daily/weekly) with change detection
- Alert on grade degradation (agent was B, now D after instruction edit)
- Leaderboard: best/worst agents by score

### Prerequisites

- v1.3.0 shipped (full config access)
- Agent enumeration API (list all agents in account, not just user's)
- Scheduling capability (Agent Builder triggers or external cron)
- Historical score storage (board with time-series data or external DB)

### Open questions

- Who is the audience? Admin/CTO view vs. individual builder view?
- Should degradation alerts go to the agent owner, the account admin, or both?
- Is there an agent modification webhook that could trigger re-evaluation automatically?
- How to handle accounts with 100+ agents? Batch rate limits?

---

## v2.1.0 — Auto-Trigger on Agent Changes

**Status:** Blocked on platform capability
**Blocker:** No agent creation/modification webhook exists in Agent Builder

### Goal

Automatically run the scorecard when an agent is created or its configuration changes. Shift-left: catch issues before the agent goes live.

### Ideal flow

```
Builder edits agent instructions
  → Webhook fires to Scorecard Agent
  → Scorecard runs evaluation
  → Results posted to board + notification to builder
  → If grade < C: block agent activation (if platform supports it)
```

### What's needed from platform

- Agent lifecycle webhooks (create, update, activate, deactivate)
- OR: polling mechanism with change detection (compare version_id from `get_agent`)
- Optional: agent activation gate (pre-activation hook that can block based on score)

### Fallback (no webhooks)

Scheduled polling: run scorecard against all agents every N hours, compare version_id to last evaluated version. Re-evaluate only changed agents. Crude but functional.

---

## Version Summary

| Version | Scope | Key Blocker | Coverage |
|---------|-------|-------------|----------|
| **v1.2.0** | Instruction-only checks via Agent Builder | None | 37% det / 80% LLM / 0% sim |
| **v1.3.0** | Full config access via MCP proxy | Internal API auth | 100% det / 100% LLM / 0% sim |
| **v1.4.0** | Simulation probes | Agent invocation API | 100% det / 100% LLM / 100% sim |
| **v2.0.0** | Org-wide dashboard | Agent enumeration API | Full + aggregate |
| **v2.1.0** | Auto-trigger on changes | Agent lifecycle webhooks | Full + continuous |
