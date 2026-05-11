# Agent Scorecard — Standards & Value

**Audience:** Leadership and stakeholders — including readers who are not security or procurement specialists (examples below spell out “what this looks like” in plain situations).

**Date:** 2026-05-10

**Release:** v2.0.0

## TL;DR

The scorecard is a quality and security gate for monday.com AI agents, anchored to the same standards that enterprise buyers, regulators, and security teams already trust. **"Is this agent safe to ship?" stops being a judgment call and becomes a measured, defensible grade.** v2.0.0 lands the full five-pillar audit (Completeness, Safety, Quality, Observability, Reliability), block-on-critical scoring, multi-judge LLM sampling, and a tier-aware deployment gate.

> **Example (non-technical):** A team is about to turn on an agent that answers grant questions and can send email. Before go-live, the scorecard returns a letter grade, a “ready / needs fixes / not ready” style call, and a list of concrete issues (for example “instructions never say what to do if a tool returns untrusted text”). That is the difference between an informal gut check on the prompt and evidence tied to named risk categories.

> **Coverage by delivery channel.** The scorecard runs in three modes with different coverage. **CLI** and **embedded app** have full configuration access (all 36 deterministic rules with `--vertical sled-grant` + 9 LLM checks + simulation probes). The **Scorecard Agent in Agent Builder** has instruction-only access via the public `get_agent` API: **15** pillar-tagged **deterministic** rules (the v1 / instruction-only set) plus **8** of **9** LLM phase-1 checks (LR-004 needs KB filenames), and **no** simulation. The other **21** deterministic rules in the 36-rule catalog—including all **4** SLED vertical rules—need tools/KB/permissions/triggers and do not run on `get_agent`-only data. Until `get_agent` is expanded or the MCP proxy ships, the in-product Scorecard Agent is a strict subset of the CLI. Standards mappings below note where coverage differs by mode.

---

## The problem

Customer-built (Tier 3) agents have no quality gate before deployment. The cost of getting it wrong is real: hallucinated outputs, runaway token loops, confidential data leaks, and prompt-injection attacks — each of which damages trust, revenue, and (in regulated verticals like SLED grants) contract eligibility.

> **Example:** An agent is published with broad tool access and a short system prompt. A week later it forwards an internal table to the wrong recipient. A scorecard-style gate would have forced an explicit discussion of blast radius, logging, and refusal behavior *before* that configuration reached customers.

---

## Why recognized standards

Every check is deliberately mapped to an established framework instead of a proprietary taxonomy. That lets the scorecard speak the language that procurement, security, and audit teams already use — which shortens deal cycles and makes findings defensible.

> **Example:** A vendor questionnaire asks, “Describe alignment to OWASP agentic risk categories.” Instead of drafting a one-off essay, the team points to the ASI mapping table produced by the audit.

### 1. OWASP Agentic Security Initiative (ASI) — Dec 2025 taxonomy

The de-facto industry standard for agent-specific risk, from the [same body](https://genai.owasp.org/initiatives/agentic-security-initiative/) behind the [OWASP Top 10](https://owasp.org/www-project-top-ten/). Every rule in the audit maps to an ASI category, and labels realign to the **[official December 2025 taxonomy](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)** as part of the next release:

| OWASP ASI | Risk | Why a buyer cares | Coverage |
|-----------|------|-------------------|----------|
| ASI-01 | Goal Hijack / Prompt Injection | Attackers can't rewrite the agent mid-conversation | All modes (S-001, S-002, C-003 deterministic; S-003, S-005, S-007, S-009 multi-judge LLM) |
| ASI-02 | Tool Misuse / Resource Overload | Powerful tools stay inside their intended purpose; runaway loops capped | All modes (R-002 loop-break keyword); full-config modes (TL-001, TL-002, EF-003, SC-005) |
| ASI-03 | Privilege & Identity Abuse (incl. PII/secret leaks) | Blast radius is contained when something goes wrong | Secret/PII regex (S-008) in all modes; granular permission analysis (PM-001/002, SC-004) in full-config modes |
| ASI-05 | RCE / Code Attacks | _N/A — out of scope at the agent layer; monday.com Agent Builder does not expose code-execution primitives_ | — |
| ASI-06 | Memory & Context Poisoning | Agent rejects malicious data injected via tool returns | All modes (S-004 multi-judge tool-output trust marker) |
| ASI-08 | Cascading Failures / Repudiation | Self-trigger loops, untraceable changes are caught before they burn tokens or corrupt data | All modes (R-001 reversibility, SC-003 autonomy keyword); full-config modes (TR-001, TR-002) |
| ASI-09 | Human-Agent Trust | Agent identity is pinned; outputs and decisions are explained and validated | All modes (S-006 identity pinning, O-001 decision log); full-config modes (SC-002, SC-006) |

**Examples (plain language):**

- **ASI-01:** Instructions that never say “ignore earlier goals if a user pastes new text” fail the same class of checks a security reviewer would call “injection resilience.”
- **ASI-03:** A fake AWS key pasted into the plan text is flagged like a secret scanner would flag it in code.
- **ASI-09:** If the agent does not say who it is and what it will not do, that reads as “identity and trust” risk — similar to why websites show terms and support contacts.

**Significance:** Enterprise security questionnaires and SOC 2 audits increasingly ask about OWASP ASI coverage. A current, mapped table answers that question — not a paragraph and not a stale reference.

### 2. NIST AI Risk Management Framework

The [U.S. federal reference framework for trustworthy AI](https://www.nist.gov/itl/ai-risk-management-framework). The roadmap explicitly threads three of its four core functions into the scorecard:

| NIST AI RMF function | How it shows up in the scorecard |
|----------------------|-----------------------------------|
| **GOVERN** | Autonomy-tier scoring modifier (GOV-001): Tier 4 agents (account-level / external) face stricter grade thresholds than Tier 1 (personal / narrow). Risk-based, not one-size-fits-all. |
| **MEASURE** | New Observability pillar (O-001 decision-log mandate, O-002 provenance/citation). Agents must explain *why*, not just *what*. |
| **MANAGE** | New Reliability pillar (R-001 reversibility posture, R-002 loop-break mandate). Agents must be containable when something goes wrong. |

**Examples:**

- **GOVERN:** A “personal assistant” that only reads one board is not held to the same numeric bar as an “account-level” agent that can touch many workspaces — same idea as different change windows for internal tools vs customer-facing systems.
- **MEASURE:** If the agent cannot point to where a decision was logged, that is treated as an observability gap, not only a “model quality” complaint.
- **MANAGE:** Instructions that never describe how to stop a runaway loop are scored like missing circuit breakers in operations.

**Significance:** NIST AI RMF is what U.S. federal procurement and large enterprises now use to evaluate AI vendors. Mapping to it directly reduces customer-side review effort.

### 3. Adversarial / red-team testing (MITRE ATLAS aligned)

The LLM Review and Simulation layers actively probe agents with injection, scope-escape, persona-drift, and exfiltration attacks — the same methodology codified in **[MITRE ATLAS](https://atlas.mitre.org/)** and used by Anthropic, OpenAI, and Google to evaluate their own models. v2 ships a **multi-judge sampling protocol** in production (k=3 with median aggregation on S-003, S-004, S-005; k=5 on S-009 persona-drift), the same statistical-reliability technique frontier labs use to reduce single-shot evaluation noise. Each sampled result emits a `_variance` and `lowConfidence` flag so operators can see which judgments to review by hand.

> **Example:** Two automated “judges” agree the refusal language is vague; a third disagrees. The report keeps the median score but marks `lowConfidence` so a human re-reads that row before sign-off.

**Coverage note:** Static red-team rubrics (S-003 defense quality, S-005 defense positioning, S-007 refusal triggers, S-009 persona-drift) run in all modes. Live adversarial probing runs against agents the harness can invoke (CLI, MCP, SDK targets); an Agent Builder runtime probe surface does not yet exist and is the primary motivation for expanding the platform agent-invocation API.

**Significance:** Regulators and enterprise customers now expect adversarial testing with statistical rigor, not just static review. This is what "AI due diligence" looks like in 2026.

### 4. Three-layer defense (mirrors AppSec SAST + DAST + Pen Test)

Scoring blends three independent layers, modeled on the proven application-security stack:

| Layer | AppSec analog | What it catches | Available in |
|-------|---------------|-----------------|--------------|
| Config Audit (36 deterministic rules across 5 pillars with SLED vertical) | SAST | Missing guardrails, scope, error handling, leaked secrets, unsafe permissions, broken triggers, KB freshness | All modes (full **36** in CLI/embedded with `--vertical sled-grant`; **15** pillar-tagged deterministic rules in Agent Builder on `get_agent`-only data) |
| LLM Review (9 checks, 4 multi-judge with k≥3) | Expert code review | Coherence, alignment, defense quality, persona drift, goal specificity, refusal concreteness, tool-output trust marker | All modes (8 of 9 in Agent Builder — KB-relevance LR-004 needs the file list) |
| Simulation Probes (6 attack scenarios) | DAST / Pen test | How the agent behaves under live attack | CLI / MCP / SDK targets only — requires programmatic agent invocation |

> **Example:** The config layer says “never expose customer IDs.” The LLM layer asks whether the prose actually supports that under paraphrase. Simulation (where available) sends a crafted tool response to see if the agent still obeys. That is the same “static + expert + live” split AppSec teams use for code.

**Coverage note:** Two layers (Config Audit + LLM Review) run against any agent today. The Simulation layer runs against code-defined agents accessible via the CLI or MCP harness. Agent Builder agents are evaluated in two-layer mode until a runtime invocation surface ships.

**Significance:** Multi-layer evaluation is the only model with a track record of catching what any single layer misses. Single-layer auditing is how breaches happen.

### 5. Severity-weighted scoring with critical block (CVSS / SSL Labs model)

Modeled on **[CVSS](https://www.first.org/cvss/)** (the industry-standard vulnerability score) and **[SSL Labs grading](https://www.ssllabs.com/ssltest/)**: weighted points by severity, and a single critical failure **blocks deployment** outright (grade F, `not-ready`) — not just a soft cap. Letter grades (A–F) match the shorthand buyers already know from [SecurityScorecard](https://securityscorecard.com/), SSL Labs, and credit ratings.

> **Example:** Everything averages to a “B” numerically, but one check marked **critical** (for example a live API key in the plan text) forces **F** and **not-ready** until it is removed — similar to how an SSL Labs “A” cannot coexist with an expired chain.

**Significance:** A "Grade A" badge is portable, defensible, and immediately understood by non-technical stakeholders. A block-on-critical model means a score can never paper over a known dangerous gap — which is what auditors actually require.

---

## What the build delivers today

- **Zero-friction workflow** — embedded monday.com app fetches agents directly via the internal API; a builder sees their grade in seconds, no export required. Full configuration access (all **36** deterministic rules with `--vertical sled-grant` + **9** LLM checks). *Example:* open the app, pick an agent, read the grade and fix list without downloading JSON.
- **CI gate** — for code-defined agents (MCP/SDK), the CLI fails the build at grade D/F. Quality becomes enforced, not requested. Agent Builder agents are gated at audit time via the in-product Scorecard Agent rather than at commit time, since they have no build pipeline. *Example:* a release job runs `agent-scorecard audit` and blocks merge when the recommendation is `not-ready`.
- **[Scorecard Agent](docs/AGENT_BUILDER_V1_SPEC.md)** — an Agent Builder agent that audits other agents natively in monday.com. Self-service, no API key. Instruction-only coverage today (**15** pillar-tagged deterministic rules + **8** of **9** LLM phase-1 checks); converges with the CLI once the internal-config MCP proxy or expanded `get_agent` ships. *Example:* in chat, “Audit agent 12345” produces board rows with pass/fail per check.
- **MCP server** — plugs into any tool that speaks Model Context Protocol, so the same audit runs from Claude, Cursor, or first-party agents. Coverage matches whatever config surface the caller provides. *Example:* Cursor passes `get_agent` JSON into `audit_agent` and pastes the report into a design doc.
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

---

## Roadmap, pilot KPIs, and user flows (where to read them)

**Canonical tables and diagrams** (roadmap §3.3, outcome KPI candidates §3.4B, user flows §5 with Mermaid + PNGs) stay in **[docs/LEADERSHIP_BRIEF_MONDAY_DOC.md](docs/LEADERSHIP_BRIEF_MONDAY_DOC.md)** so monday Docs / Slides / GitHub can link to one file.

**Cursor:** The same storyline is summarized in the **Agent Evaluator** **Canvas** — open **`agent-scorecard-leadership.canvas.tsx`** from the Canvases list for this workspace (managed under `~/.cursor/projects/.../canvases/` on disk). That canvas is the intended companion to this standards doc for non-export, in-IDE reading.

Engineering detail for roadmap phases also remains in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Bottom line

No new quality bar was invented here. The scorecard adopts the bars that **enterprise security, regulators, and buyers already use** — OWASP ASI (Dec 2025), NIST AI RMF (GOVERN / MEASURE / MANAGE), MITRE ATLAS, CVSS-style scoring — and packages them into a one-click experience for monday.com agent builders.

The result: shipping AI agents stops being a leap of faith and starts being a measurable, defensible engineering practice — one that grows with the standards landscape rather than calcifying against it.
