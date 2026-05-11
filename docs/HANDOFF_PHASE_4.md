# Handoff: Phase 4 (Tests, Fixtures, Docs) + Production Re-provisioning

## Phase 4 status (2026-05-10)

**All Phase 4 work shipped.** Full status table at the bottom (`Phase 4 — Final status`). One item is blocked on monday platform recovery; everything else (P0-B, P1-A through P1-G, P2-D / P2-F / P2-G, Batches A / B / C) is done. Test count: **401 / 401 green** in 40 files.

The only outstanding item is **P0-A — re-provision the live Scorecard Agent**. Token is valid, the script's bug (manual-vs-prompt mode confusion) is fixed and documented, but monday's agent-management subsystem returns 500 "Internal server error" on every `create_agent` / `get_agent` / `delete_agent` call for this account while every non-agent MCP tool works. Re-run `MONDAY_API_TOKEN=xxx npx tsx scripts/provision-agent.ts` once monday recovers.

## What's done (Phases 0-3)

The taxonomy expansion shipped:

- 32 universal rules + 4 SLED vertical rules + 5 LLM checks (S-003, S-004, S-005, S-007, S-009, C-007 added in Tier B; S-006/S-008/C-005/C-008 added in Tier A; O-001, O-002, R-001, R-002 added across both tiers).
- Block-on-critical scoring (severity weights `10:3:1`).
- OWASP ASI mappings refreshed to the December 2025 official taxonomy.
- Whole-word `findKeywords` matching to kill substring false-positives.
- Multi-judge LLM sampling (`completeJsonSampled(k=3, median)`) on S-003/S-004; k=5 on S-009.
- Pillar-based bucketing + Observability + Reliability pillars in scoring.
- GOV-001 autonomy-tier modifier with tier-aware ready thresholds (75/80/85/90 for tiers 1-4).
- Sync mechanism: `npm run gen:spec` regenerates `docs/AGENT_BUILDER_V1_SPEC.md` from the per-rule `agentPromptSnippet` fields; `npm run gen:spec:check` is wired into `npm run verify` so drift fails CI.
- All 329 unit tests pass; `npm run verify` is green.

Pillar inventory:

| Pillar | Rules |
|---|---|
| Completeness | C-001 length, C-002 error handling, C-003 scope, C-004 duplication, C-005 per-section length, C-007 goal specificity (LR), C-008 state/kind sanity |
| Safety | S-001 guardrails, S-002 injection defense, S-003 defense effectiveness (LR), S-004 tool-output trust (LR), S-005 defense positioning (LR), S-006 identity pinning, S-007 refusal concreteness (LR), S-008 PII/secrets, S-009 persona drift (LR) |
| Quality | Q-001 information density, Q-002 coherence (LR), Q-003 plan-goal alignment (LR), Q-004 tailored fixes (LR) |
| Observability | O-001 decision-log mandate, O-002 provenance/citation |
| Reliability | R-001 reversibility, R-002 loop-break |
| Modifier | GOV-001 autonomy-tier (in `src/scoring/autonomy-tier.ts`) |

## What's left

### Production re-provisioning (blocked on token)

The `provision-agent.ts` script now imports `AGENT_USER_PROMPT` from the canonical module, so the live agent in monday.com Agent Builder is **drifted** from the new TS pipeline (it's still on the old 7-rule prompt). Re-run when you have credentials:

```bash
MONDAY_API_TOKEN=xxx npx tsx scripts/provision-agent.ts
```

The script will:
1. Compose the new 17.6 KB user_prompt from per-rule snippets.
2. Call `create_agent` on `mcp.monday.com/mcp` to create a new Scorecard Agent revision.
3. Verify by fetching back via `get_agent` and comparing prompt length.
4. Print the new agent ID for UI follow-up (enable required tools, paste goal/plan).

If the existing live agent should be **updated** rather than replaced, check whether monday's MCP exposes an `update_agent` tool — `provision-agent.ts` currently only calls `create_agent`.

### Phase 4 — Tests, fixtures, docs (~6-10 hrs)

Split into three independent batches that can be done in parallel:

**Batch A — Per-rule fixtures (~2-3 hrs)**
For each new rule, add a `tests/fixtures/per-rule/<rule-id>-{pass,fail}.json` pair:

- `c005-pass.json` / `c005-fail.json` — section-length balance
- `c007-pass.json` / `c007-fail.json` — vague vs specific goal
- `c008-pass.json` / `c008-fail.json` — INACTIVE state, EXTERNAL kind
- `s006-pass.json` / `s006-fail.json` — identity pinning at top vs buried
- `s008-pass.json` / `s008-fail.json` — secret in instructions (use a clearly fake one like `AKIAIOSFODNN7EXAMPLE`)
- `o001-*.json`, `o002-*.json`, `r001-*.json`, `r002-*.json` — keyword presence/absence
- `gov001-tier1.json` … `gov001-tier4.json` — kind + plan combinations that trigger each tier

Add a `tests/fixtures/per-rule/per-rule.test.ts` that loops over every fixture and asserts the named rule passes/fails as expected. This catches regressions when keyword lists are tweaked.

**Batch B — Extend good/bad/incident fixtures (~2-3 hrs)**

- Update `tests/fixtures/good-agent.json` to satisfy O-001, R-001, S-006-at-top so it recovers a clean A grade (currently 95.5/A with 4 failed informational/warning checks). This validates that all v1 rules are achievable by a well-built agent.
- Update `tests/fixtures/bad-agent.json` to demonstrate one failure per rule (S-008 secret leak, missing observability mandate, etc.).
- Seed `tests/fixtures/incidents/` with anonymized real-world examples that motivated each new rule:
  - `incident-tool-output-injection.json` (S-004) — agent followed instructions injected via a board column.
  - `incident-persona-drift.json` (S-009) — agent talked into a different role via roleplay framing.
  - `incident-secret-leak.json` (S-008) — agent prompt accidentally shipped with a Slack webhook URL.
  - `incident-runaway-loop.json` (R-002) — agent kept retrying a failing tool with no max-attempts cap.

**Batch C — Docs refresh (~2-4 hrs)**

- Rewrite the README rule table to enumerate all 36 rules with pillars + new severities (current table is stale, still says 24 universal).
- Update `docs/STANDARDS_AND_VALUE.md` if it references the old 7-rule v1 surface.
- Update `docs/AGENT_BUILDER_SETUP.md` to mention the regeneratable spec and the GOV-001 autonomy tier surfaced in reports.
- Add a `CHANGELOG.md` entry for v2.0.0 covering: severity weight rebalance, block-on-critical, OWASP refresh, new pillars/rules, multi-judge sampling, autonomy tier, sync mechanism. Bump `package.json` version.
- Refresh the canvas (the conversation that produced this work) if the user wants the public-facing rollup updated.

### Risk notes for Phase 4

- The existing `cli.e2e.test.ts` has been relaxed to accept either status 0 or 1 for the edge-case and child-agent fixtures because they now fail S-002 (no injection defense). When you fix the fixtures in Batch A/B, tighten those expectations back to `toBe(0)` so we re-catch regressions.
- The QA report description "(17 rules with sled-grant)" in `tests/qa-validation.test.ts` is now wrong — correct it to "(36 rules with sled-grant)".
- The mock LLM client in `tests/llm-review/mock-client.ts` needs to grow if any new LR check is added; the `identifyCheck` substring matcher is brittle. Consider replacing with a registration map keyed off the check ID.
- LLM API spend will roughly 3x once Tier B LR checks are enabled in production runs (5 → 9 phase-1 checks, 3 of which sample at k=3 or k=5). Document this in the README cost estimate.

## Concerns flagged at handoff

These were surfaced after Phase 3 finished. Rough priority ordering: P0 = fix before another release goes out; P1 = fix as part of Phase 4; P2 = nice-to-have hygiene.

### P0 — Compatibility / production drift

**P0-A. Re-provision the live Scorecard Agent.**
The agent in monday.com Agent Builder is still running the old 7-rule, `3:2:1`-weighted, cap-at-C prompt. The TS pipeline and the live agent will disagree on every audit until this runs:

```bash
MONDAY_API_TOKEN=xxx npx tsx scripts/provision-agent.ts
```

Before running, verify monday's `create_agent` `user_prompt` size limit. The composed prompt is now 17.6 KB (up from ~7 KB). If `create_agent` rejects it, you'll need to either chunk the prompt or trim per-rule snippets — there's no graceful fallback in the script today.

**P0-B. Score model is breaking; offer a one-release escape hatch.**
Block-on-critical + the `10:3:1` weight rebalance changes both grades and numeric scores for any agent with critical failures. Anyone consuming the JSON report (dashboards, CI gates, score-over-time charts) will see discontinuities at the v1→v2 boundary.

Options (pick one):
- Add a `--legacy-scoring` CLI flag and a `legacy_scoring` MCP parameter that pins severity weights to `LEGACY_SEVERITY_WEIGHTS` and replaces block-on-critical with the old cap-at-C, for one release. Mark deprecated.
- Bump major version and document the break loudly in `CHANGELOG.md` (current plan, but no changelog written yet).

If there are no external consumers, just do option 2.

### P1 — Coverage gaps that will mask regressions

**P1-A. Add per-check unit tests for the 5 new LR checks.**
Currently only `lr-001.test.ts` and `lr-002.test.ts` exist. Mirror them for:
- `tests/llm-review/checks/lr-006.test.ts` (S-004 — k=3 sampling, threshold 60, ASI-06 evidence field, recommendation fires below 60)
- `tests/llm-review/checks/lr-007.test.ts` (S-005 — single-shot, threshold 70, defenses_at_top evidence)
- `tests/llm-review/checks/lr-008.test.ts` (S-007 — concrete vs vague trigger classification surfaces in evidence)
- `tests/llm-review/checks/lr-009.test.ts` (S-009 — k=5 sampling, weakest_attack_pattern surfaces in recommendation)
- `tests/llm-review/checks/lr-010.test.ts` (C-007 — three-axis scoring, improved_goal_example in recommendation)

Each test should cover: happy path, fail path, malformed-JSON path (should return score=0), and check the `pillar` and `agentPromptSnippet` fields are set so the agent prompt builder picks them up.

**P1-B. Test the median aggregation in `completeJsonSampled`.**
Today the mock client returns identical responses across all k samples, so `_variance=0` is the only path tested. A bad implementation that takes the mean instead of median would still pass. Add `tests/llm-review/llm-client-sampled.test.ts` that:
- Returns scores `[40, 50, 90]` across 3 samples → asserts median = 50, NOT mean = 60.
- Returns `[60, 60, 60, 60, 100]` → asserts median = 60.
- Returns 1 success and 2 failures → asserts function still returns the successful sample.
- Returns all failures → asserts function throws with the count in the message.

**P1-C. Tighten `cli.e2e.test.ts` after fixtures are fixed.**
`expect([0, 1]).toContain(r.status)` will pass whether the fixture is healthy or critically broken — useless as a regression signal. Once `edge-case-agent.json` and `child-agent.json` get S-002 keywords in Batch A/B, change those back to `expect(r.status).toBe(0)`.

**P1-D. Make `good-agent.json` actually clean.**
Currently scores 95.5 with 4 failed checks (C-005 short user_prompt, S-006 buried identity-pinning, O-001 no observability mandate, R-001 no reversibility). The "good" fixture should pass every rule it's eligible for so we can assert `score === 100` and any drop signals a regression. Move identity-pinning to the start of the goal, lengthen `userPrompt` past 200 chars, add an observability + reversibility clause.

### P1 — Implementation inconsistencies

**P1-E. GOV-001 surface classifier should use whole-word matching.**
`src/scoring/autonomy-tier.ts` `countMatches()` uses `lower.includes(kw)` — the exact substring-matching pattern Phase 0.4 fixed elsewhere. So a plan saying "we will not send any email" still counts toward broad surface. Replace with the `matchKeyword` helper from `src/auditors/auditor-utils.ts`, then add tests:
- "we will never send email" → narrow, NOT broad
- "send email when status changes" → broad

**P1-F. Delete or replace `INSTRUCTION_ONLY_RULE_IDS`.**
It's marked `@deprecated` and frozen as a snapshot. If anyone keeps importing it, new v1 rules will silently miss the MCP filter. Two options:
- Delete the export, fix any remaining callers (search shows `scripts/test-e2e-mcp.ts` and `scripts/test-mcp-pipeline.ts` still use it).
- Keep it but turn it into a getter that calls `getRulesForVertical().filter(isInstructionOnlyRule).map(r => r.id)` so it always reflects current state.

**P1-G. Decide what to do with C-001.**
The plan said C-005 "deprecates C-001 lump-sum"; in practice both still run. They're not redundant (C-001 = 100 ≤ total ≤ 10,000; C-005 = per-section bounds), but the rule descriptions don't explain why both exist. Either:
- Rename C-001 to "Total instruction length floor" and tighten its bounds to just "min 100", letting C-005 own the upper-bound checks.
- Drop C-001 entirely if you trust C-005's per-section minimums to catch the "way too short" case.

### P2 — Nice-to-have hygiene

**P2-A. CHANGELOG + version bump.**
Create `CHANGELOG.md` with a v2.0.0 entry covering: severity weight rebalance, block-on-critical, OWASP Dec 2025 refresh, 5 new pillars / 14 new rules, multi-judge LLM sampling, GOV-001 autonomy tier, surface-sync mechanism. Bump `package.json` from `1.1.0` to `2.0.0`.

**P2-B. Refresh `docs/STANDARDS_AND_VALUE.md`.**
Currently still describes the old 7-rule v1 surface. Misleads anyone reading it for the pitch / scope of the audit.

**P2-C. Replace `mock-client.ts` `identifyCheck` substring matcher.**
It's brittle — change a prompt phrase that happens to be the matcher and tests silently fall through to the Q-002 default response with no error. Consider a registration approach where each LR check exports a `mockResponse` constant and the mock client looks them up by check ID passed as a hidden marker in the prompt.

**P2-D. Add a prompt-size regression test.**
Add `tests/agent-builder/build-agent-prompt.test.ts` that asserts the composed prompt:
- Stays under monday's `create_agent` size limit (whatever you discover it to be in P0-A).
- Contains a snippet from every v1 rule (loop over `getRulesForVertical().filter(r => r.pillar)`).
- Contains the scoring + board output blocks.

**P2-E. Document LLM API cost estimate in the README.**
At Haiku pricing per audit:
- Old: ~5 calls × ~1 KB prompt = trivial.
- New: 4 single-shot + 2×k=3 + 1×k=5 + Q-004 = ~16-18 calls per full audit. ~3.6× spend.
At scale this adds up. Add a "Cost" subsection under "MCP Server" in the README so users know what they're signing up for.

**P2-F. Surface `_variance` to the report.**
`completeJsonSampled` returns `_variance` and `_samples` on the parsed response, and the LR checks pass them through to `evidence`, but the CLI table reporter and JSON reporter don't show them. A high-variance critical check (e.g. one judge scored S-003 = 30, another scored 90) is exactly the case humans should review — surface it as a "low-confidence" tag in the CLI output.

**P2-G. ASI-04 (Supply Chain) and ASI-05 (RCE) have no rules.**
Currently flagged "no rules — flagged for future work" in the README. Worth deciding: is ASI-05 (RCE / Code Attacks) actually applicable to monday agents at all? They don't execute arbitrary code. If not, mark it "N/A" rather than "future work" so the table stops looking incomplete. ASI-04 (Supply Chain) is more interesting — could become a rule that flags agents pulling KB content from untrusted external sources, but needs design.

---

## Phase 4 — Final status

| ID | Item | Status |
|----|------|--------|
| P0-A | Re-provision live Scorecard Agent | **Blocked — monday platform 500.** Script bug fixed (manual mode requires NOT passing `prompt`); awaiting monday-side recovery of agent-management endpoints. |
| P0-B | v2.0.0 bump + CHANGELOG | Done — `package.json` at 2.0.0, `CHANGELOG.md` written. |
| P1-A | Per-check tests for 5 new LR checks (lr-006/007/008/009/010) | Done — ~25 new tests. |
| P1-B | Median aggregation suite for `completeJsonSampled` | Done — 7-test `tests/llm-review/llm-client-sampled.test.ts`. |
| P1-C | Tighten `cli.e2e.test.ts` to `toBe(0)` | Done — fixtures cleaned, both edge-case + child now exit 0. |
| P1-D | `good-agent.json` scores 100/A | Done — 36/36 universal checks pass. |
| P1-E | GOV-001 surface classifier whole-word matching | Done — uses `matchKeyword` from `auditor-utils.ts`. |
| P1-F | Replace `INSTRUCTION_ONLY_RULE_IDS` snapshot | Done — `instructionOnlyRuleIds()` getter; 2 script callers updated. |
| P1-G | Reframe C-001 vs C-005 | Done — C-001 is now "Total instruction length floor" (200-char min); upper bound owned by C-005. |
| Batch A | Per-rule fixtures + harness | Done — 22 fixtures (`tests/fixtures/per-rule/`) + `per-rule.test.ts`; schema validator now recurses subdirs. |
| Batch B | Extend bad-agent.json + seed `incidents/` | Done — bad-agent demonstrates 11 critical fails; 4 incident fixtures with `_incident` metadata + `incidents.test.ts`. |
| QA text fix | "(17 rules with sled-grant)" → "(36 rules with sled-grant)" | Done. |
| P2-D | Prompt-size regression test | Done — `tests/agent-builder/build-agent-prompt.test.ts`, 8 tests, current prompt 17 705 / 25 000-char ceiling. |
| P2-F | Surface `_variance` + low-confidence tag in CLI/JSON | Done — `LlmReviewResult.{samples, variance, lowConfidence}` populated by reviewer; CLI shows `n=k σ=…` column with `⚠` tag when variance ≥ 200. |
| P2-G | Mark ASI-05 N/A in README OWASP table | Done — N/A with rationale (no code-execution primitives in Agent Builder). |
| Batch C | README rule table for 36 rules + pillars + cost | Done — full rewrite with v1 / full-mode split, LR table with k-values, $0.02-0.04 per audit cost note. |
| Batch C | Refresh `docs/STANDARDS_AND_VALUE.md` | Done — counts updated (36 rules + 9 LR), roadmap reframed as "shipped in v2.0.0". |
| Batch C | Update `docs/AGENT_BUILDER_SETUP.md` | Done — Plan section rewritten for the 5-pillar / block-on-critical / tier-aware flow; troubleshooting expanded with `lowConfidence` and v2 scoring rules. |

### Outstanding

- **P0-A retry** — when monday's agent-management subsystem recovers, run `MONDAY_API_TOKEN=xxx npx tsx scripts/provision-agent.ts` to push the v2.0.0 prompt to the live agent. The script and the prompt-size regression test (P2-D) make this a one-shot operation.
- **P2-A / P2-B** were superseded by P0-B / Batch C respectively (handled together).
- **P2-C** (mock-client substring matcher) and **P2-E** (cost note in README) — P2-E is done as part of Batch C; P2-C is still latent technical debt but no test currently regresses on it.
