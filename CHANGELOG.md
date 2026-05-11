# Changelog

All notable changes to `agent-scorecard` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [SemVer](https://semver.org/).

## [2.0.0] — 2026-05-10

This is a **breaking** release. Anyone consuming the JSON report (CI gates,
dashboards, score-over-time charts) will see discontinuities at the v1→v2
boundary because the scoring model changed and new pillars were added. There
is no `--legacy-scoring` shim — pin to `agent-scorecard@1.x` if you need the
old surface for one more cycle.

### Breaking changes — scoring

- **Severity weight rebalance:** critical/warning/info now weight `10:3:1`
  (was `3:2:1`). A single critical failure can no longer be papered over by
  a long tail of passing info checks.
- **Block-on-critical:** any failed critical rule forces grade `F` and
  `deploymentRecommendation = 'not-ready'`, regardless of raw score. The
  prior "cap-at-C" semantics are gone — a single broken safety rail must
  prevent deployment, not merely downgrade it.
- **GOV-001 autonomy-tier modifier:** higher autonomy tiers now face stricter
  `ready` thresholds (Tier 1: ≥75, Tier 2: ≥80, Tier 3: ≥85, Tier 4: ≥90).
  An ACCOUNT_LEVEL or EXTERNAL agent with broad capability surface can no
  longer be marked `ready` at a B grade.
- **Pillar scores:** reports now include `pillarScores[]` with per-pillar
  breakdown (Completeness, Safety, Quality, Observability, Reliability).

### Breaking changes — taxonomy

- **OWASP ASI mappings refreshed** to the [official December 2025
  taxonomy](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/).
  Re-mapped:
  - SC-002 (data exfiltration): ASI-04 → ASI-09
  - SC-003 (excessive autonomy): ASI-05 → ASI-08
  - SC-005 (URL restrictions): ASI-06 → ASI-02

### New rules — universal pillars

| Pillar | New rules |
|---|---|
| Completeness | C-005 per-section length balance, C-007 goal specificity (LR), C-008 state/kind sanity |
| Safety | S-003 defense effectiveness (LR, k=3), S-004 tool-output trust (LR, k=3), S-005 defense positioning (LR), S-006 identity pinning, S-007 refusal concreteness (LR), S-008 PII/secret regex, S-009 persona-drift red-team (LR, k=5) |
| Observability | O-001 decision-log mandate, O-002 provenance / citation |
| Reliability | R-001 reversibility posture, R-002 loop-break / max-iteration |
| Modifier | GOV-001 autonomy-tier inference |

Total: 32 universal rules + 4 SLED vertical rules + 8 LLM review checks.

### New behavior

- **Multi-judge LLM sampling** (`completeJsonSampled`) on the highest-stakes
  LR checks: k=3 for S-003 / S-004, k=5 for S-009. Median aggregation with
  per-call temperature 0.7 and three deterministic prompt re-framings to
  reduce framing bias. Surfaces `_variance` and `_samples` on evidence so
  reviewers can spot low-confidence judgments.
- **Whole-word keyword matching** in `findKeywords` — anchored on word
  boundaries with `\s+` for multi-word phrases. Kills the substring
  false-positives where, e.g., `decline to confirm dates` was read as a
  guardrail.
- **Surface-sync mechanism:** `npm run gen:spec` regenerates
  `docs/AGENT_BUILDER_V1_SPEC.md` from the per-rule `agentPromptSnippet` fields
  in source. `npm run gen:spec:check` is wired into `npm run verify` so
  prompt drift between the live agent and the TS pipeline fails CI.

### Fixed

- **C-001** is now a min-length floor only. Per-section length balance is
  owned by C-005 (which has stricter, field-aware bounds). C-001's old
  upper-bound behavior remains but the rule prose now defers to C-005 for
  per-section diagnostics.
- **GOV-001 capability-surface classifier** uses whole-word matching (was
  bare substring match — Phase 0.4 fix backported). Plans like "we will
  never send any email" no longer count toward broad surface.
- **`INSTRUCTION_ONLY_RULE_IDS`** removed — replaced everywhere by
  `isInstructionOnlyRule(rule)` so newly added v1 rules are picked up
  automatically by the MCP filter (previously the snapshot was frozen and
  silently excluded new rules).
- **`good-agent.json`** fixture now scores 100 / A — passes every rule it's
  eligible for, so any drop in CI signals a regression.
- **`bad-agent.json`** fixture now demonstrates one failure per universal
  rule, including S-008 PII/secret leak via a clearly fake AWS access key.

### Removed

- `INSTRUCTION_ONLY_RULE_IDS` exported set (use `isInstructionOnlyRule`
  predicate instead).
- `LR-005` is no longer a phase-1 LR check — it was renumbered to Q-004
  and runs after phase-1 results so it can produce tailored fixes per
  failed check.

### Documentation

- README rule table fully rewritten to enumerate all 36 rules with pillars,
  severities, and OWASP ASI tags. ASI-05 (RCE) is now marked `N/A` —
  monday agents do not execute arbitrary code.
- Added LLM API cost estimate to README ("MCP Server" section).
- Added incident fixtures under `tests/fixtures/incidents/` showing
  anonymized real-world cases that motivated each new rule.
- Added per-rule fixture suite under `tests/fixtures/per-rule/` covering
  every new rule with a `pass` / `fail` JSON pair.

### Migration guide

If you depended on v1.x:

1. Pin `agent-scorecard@^1.1.0` if you need one more cycle on the old
   scoring model.
2. Otherwise: re-baseline your dashboards. Expect failed-critical agents to
   drop from C to F. Expect ACCOUNT_LEVEL / EXTERNAL agents previously
   marked `ready` at B to flip to `needs-fixes` until they reach the
   tier-aware threshold.
3. If you provisioned the Scorecard Agent in monday.com Agent Builder via
   the old `provision-agent.ts`, re-run it: `MONDAY_API_TOKEN=xxx npx tsx
   scripts/provision-agent.ts`. The composed user prompt grew from ~7 KB
   to ~17.6 KB to cover the new pillars.

## [1.1.0] — 2026-04 (legacy)

Previous release on the 24-rule taxonomy with `3:2:1` severity weights and
cap-at-C semantics. See git history.
