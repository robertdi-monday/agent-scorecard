# Agent Scorecard — Standards & Value

**Audience:** Leadership and stakeholders
**Date:** 2026-05-10
**Release:** v2.0.0

## TL;DR

We built a quality and security gate for monday.com AI agents, anchored to the same standards that enterprise buyers, regulators, and security teams already trust. **"Is this agent safe to ship?" stops being a judgment call and becomes a measured, defensible grade.** v2.0.0 lands the full five-pillar audit (Completeness, Safety, Quality, Observability, Reliability), block-on-critical scoring, multi-judge LLM sampling, and a tier-aware deployment gate.

> **Coverage by delivery channel.** The scorecard runs in three modes with different coverage. **CLI** and **embedded app** have full configuration access (all 36 deterministic rules + 9 LLM checks + simulation probes). The **Scorecard Agent in Agent Builder** has instruction-only access via the public `get_agent` API (24 of 36 deterministic rules + 8 of 9 LLM checks, no simulation). Tool-, KB-, and permission-dependent rules require the platform's internal config API; until `get_agent` is expanded or the MCP proxy ships, the in-product Scorecard Agent is a strict subset of the CLI. Standards mappings below note where coverage differs by mode.

---

## The problem

Customer-built (Tier 3) agents have no quality gate before deployment. The cost of getting it wrong is real: hallucinated outputs, runaway token loops, confidential data leaks, and prompt-injection attacks — each of which damages trust, revenue, and (in regulated verticals like SLED grants) contract eligibility.

## Why we chose recognized standards

We deliberately mapped every check to an established framework instead of inventing our own taxonomy. This makes our scorecard speak the language that procurement, security, and audit teams already use — which shortens deal cycles and makes findings defensible.

### 1. OWASP Agentic Security Initiative (ASI) — Dec 2025 taxonomy

The de-facto industry standard for agent-specific risk, from the [same body](https://genai.owasp.org/initiatives/agentic-security-initiative/) behind the [OWASP Top 10](https://owasp.org/www-project-top-ten/). Every rule in the audit maps to an ASI category, and we are realigning to the **[official December 2025 taxonomy](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)** as part of the next release:

| OWASP ASI | Risk | Why a buyer cares | Coverage |
|-----------|------|-------------------|----------|
| ASI-01 | Goal Hijack / Prompt Injection | Attackers can't rewrite the agent mid-conversation | All modes (S-001, S-002, C-003 deterministic; S-003, S-005, S-007, S-009 multi-judge LLM) |
| ASI-02 | Tool Misuse / Resource Overload | Powerful tools stay inside their intended purpose; runaway loops capped | All modes (R-002 loop-break keyword); full-config modes (TL-001, TL-002, EF-003, SC-005) |
| ASI-03 | Privilege & Identity Abuse (incl. PII/secret leaks) | Blast radius is contained when something goes wrong | Secret/PII regex (S-008) in all modes; granular permission analysis (PM-001/002, SC-004) in full-config modes |
| ASI-05 | RCE / Code Attacks | _N/A — out of scope at the agent layer; monday.com Agent Builder does not expose code-execution primitives_ | — |
| ASI-06 | Memory & Context Poisoning | Agent rejects malicious data injected via tool returns | All modes (S-004 multi-judge tool-output trust marker) |
| ASI-08 | Cascading Failures / Repudiation | Self-trigger loops, untraceable changes are caught before they burn tokens or corrupt data | All modes (R-001 reversibility, SC-003 autonomy keyword); full-config modes (TR-001, TR-002) |
| ASI-09 | Human-Agent Trust | Agent identity is pinned; outputs and decisions are explained and validated | All modes (S-006 identity pinning, O-001 decision log); full-config modes (SC-002, SC-006) |

**Significance:** Enterprise security questionnaires and SOC 2 audits increasingly ask about OWASP ASI coverage. We can answer with a current, mapped table — not a paragraph and not a stale reference.

### 2. NIST AI Risk Management Framework

The [U.S. federal reference framework for trustworthy AI](https://www.nist.gov/itl/ai-risk-management-framework). Our roadmap explicitly threads three of its four core functions into the scorecard:

| NIST AI RMF function | How we implement it |
|----------------------|---------------------|
| **GOVERN** | Autonomy-tier scoring modifier (GOV-001): Tier 4 agents (account-level / external) face stricter grade thresholds than Tier 1 (personal / narrow). Risk-based, not one-size-fits-all. |
| **MEASURE** | New Observability pillar (O-001 decision-log mandate, O-002 provenance/citation). Agents must explain *why*, not just *what*. |
| **MANAGE** | New Reliability pillar (R-001 reversibility posture, R-002 loop-break mandate). Agents must be containable when something goes wrong. |

**Significance:** NIST AI RMF is what U.S. federal procurement and large enterprises now use to evaluate AI vendors. Mapping to it directly reduces customer-side review effort.

### 3. Adversarial / red-team testing (MITRE ATLAS aligned)

Our LLM Review and Simulation layers actively probe agents with injection, scope-escape, persona-drift, and exfiltration attacks — the same methodology codified in **[MITRE ATLAS](https://atlas.mitre.org/)** and used by Anthropic, OpenAI, and Google to evaluate their own models. v2 ships a **multi-judge sampling protocol** in production (k=3 with median aggregation on S-003, S-004, S-005; k=5 on S-009 persona-drift), the same statistical-reliability technique frontier labs use to reduce single-shot evaluation noise. Each sampled result emits a `_variance` and `lowConfidence` flag so operators can see which judgments to review by hand.

**Coverage note:** Static red-team rubrics (S-003 defense quality, S-005 defense positioning, S-007 refusal triggers, S-009 persona-drift) run in all modes. Live adversarial probing runs against agents the harness can invoke (CLI, MCP, SDK targets); an Agent Builder runtime probe surface does not yet exist and is the primary motivation for expanding the platform agent-invocation API.

**Significance:** Regulators and enterprise customers now expect adversarial testing with statistical rigor, not just static review. This is what "AI due diligence" looks like in 2026.

### 4. Three-layer defense (mirrors AppSec SAST + DAST + Pen Test)

Scoring blends three independent layers, modeled on the proven application-security stack:

| Our layer | AppSec analog | What it catches | Available in |
|-----------|---------------|-----------------|--------------|
| Config Audit (36 deterministic rules across 5 pillars) | SAST | Missing guardrails, scope, error handling, leaked secrets, unsafe permissions, broken triggers, KB freshness | All modes (full 36 in CLI/embedded; 24 instruction-only rules in Agent Builder) |
| LLM Review (9 checks, 4 multi-judge with k≥3) | Expert code review | Coherence, alignment, defense quality, persona drift, goal specificity, refusal concreteness, tool-output trust marker | All modes (8 of 9 in Agent Builder — KB-relevance LR-004 needs the file list) |
| Simulation Probes (6 attack scenarios) | DAST / Pen test | How the agent behaves under live attack | CLI / MCP / SDK targets only — requires programmatic agent invocation |

**Coverage note:** Two layers (Config Audit + LLM Review) run against any agent today. The Simulation layer runs against code-defined agents accessible via the CLI or MCP harness. Agent Builder agents are evaluated in two-layer mode until a runtime invocation surface ships.

**Significance:** Multi-layer evaluation is the only model with a track record of catching what any single layer misses. Single-layer auditing is how breaches happen.

### 5. Severity-weighted scoring with critical block (CVSS / SSL Labs model)

Modeled on **[CVSS](https://www.first.org/cvss/)** (the industry-standard vulnerability score) and **[SSL Labs grading](https://www.ssllabs.com/ssltest/)**: weighted points by severity, and a single critical failure **blocks deployment** outright (grade F, `not-ready`) — not just a soft cap. Letter grades (A–F) match the shorthand buyers already know from [SecurityScorecard](https://securityscorecard.com/), SSL Labs, and credit ratings.

**Significance:** A "Grade A" badge is portable, defensible, and immediately understood by non-technical stakeholders. A block-on-critical model means a score can never paper over a known dangerous gap — which is what auditors actually require.

---

## What the build delivers today

- **Zero-friction workflow** — embedded monday.com app fetches agents directly via the internal API; a builder sees their grade in seconds, no export required. Full configuration access (all 36 deterministic rules + 9 LLM checks).
- **CI gate** — for code-defined agents (MCP/SDK), the CLI fails the build at grade D/F. Quality becomes enforced, not requested. Agent Builder agents are gated at audit time via the in-product Scorecard Agent rather than at commit time, since they have no build pipeline.
- **[Scorecard Agent](AGENT_BUILDER_V1_SPEC.md)** — an Agent Builder agent that audits other agents natively in monday.com. Self-service, no API key. Instruction-only coverage today (24 of 36 deterministic rules + 8 of 9 LR checks); converges with the CLI once the internal-config MCP proxy or expanded `get_agent` ships.
- **MCP server** — plugs into any tool that speaks Model Context Protocol, so the same audit runs from Claude, Cursor, or our own agents. Coverage matches whatever config surface the caller provides.
- **Vertical rule packs** — SLED grant pack ships today; same framework supports finance, healthcare, etc. without re-architecting. Keyword-driven pack rules run in all modes; KB-driven rules require full-config access.

## What v2.0.0 shipped (vs. v1)

Every addition is anchored to a specific standard. v1 was 17 rules across 3 pillars; v2 is 36 rules across 5 pillars + 1 governance modifier + 9 LLM checks.

| Shipped in v2.0.0 | Standards driver |
|-------------------|------------------|
| All OWASP labels realigned to Dec 2025 ASI taxonomy; ASI-05 marked N/A with rationale | OWASP currency — closes audit gaps; honest scope statement instead of false coverage |
| **Observability** pillar (O-001 decision-log, O-002 provenance/citation) | NIST AI RMF MEASURE function |
| **Reliability** pillar (R-001 reversibility, R-002 loop-break) | NIST AI RMF MANAGE function |
| Autonomy-tier scoring (GOV-001 modifier) with whole-word capability surface detection | NIST AI RMF GOVERN + risk-tiered assessment ([EU AI Act](https://artificialintelligenceact.eu/) precedent) |
| PII / secret regex scan (S-008) | Industry DLP practice; closes ASI-03 gap |
| Persona-drift red-team (S-009) with k=5 attack rubric across 5 patterns (roleplay, encoded, urgency, memory injection, authority) | MITRE ATLAS adversarial testing |
| Tool-output trust marker (S-004) — instructions must mark retrieved data as DATA, not commands | OWASP ASI-06 |
| Defense positioning (S-005) and refusal concreteness (S-007) sampled red-teams | MITRE ATLAS / OWASP ASI-01 |
| Multi-judge LLM sampling (k=3 / k=5, median) with `lowConfidence` annotation when judges disagree | Frontier-lab evaluation methodology — statistical reliability surfaced to the operator |
| Block-on-critical (severity weights 10:3:1) | CVSS-style enforcement, not advisory |
| Goal specificity scoring (C-007) on three axes (domain × outcome × scope) | NIST AI RMF MEASURE |
| Per-section length balance (C-005) and instruction-floor (C-001) split | Diagnostic precision over single lump-sum check |

## What changes for the business

| Before | After |
|--------|-------|
| "Trust the builder" | Measured grade per agent, every time |
| Issues found in production | Issues caught at deploy time |
| AI-safety questions answered with words | Answered with a scorecard mapped to OWASP + NIST |
| One-size-fits-all evaluation | Risk-tiered: external/account-level agents held to higher bar |
| New regulated vertical = bespoke review | New vertical = a rule pack |

## Bottom line

We did not invent a quality bar. We adopted the bars that **enterprise security, regulators, and buyers already use** — OWASP ASI (Dec 2025), NIST AI RMF (GOVERN / MEASURE / MANAGE), MITRE ATLAS, CVSS-style scoring — and packaged them into a one-click experience for monday.com agent builders.

The result: shipping AI agents stops being a leap of faith and starts being a measurable, defensible engineering practice — one that grows with the standards landscape rather than calcifying against it.
