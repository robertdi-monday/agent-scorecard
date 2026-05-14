import type { AgentConfig, AuditRule } from '../config/types.js';
import { findKeywords, getInstructionText } from './auditor-utils.js';
import {
  REVERSIBILITY_KEYWORDS,
  RETRY_LIMIT_KEYWORDS,
} from '../config/constants.js';

// ── R-001: Reversibility posture (Tier B) ───────────────────────────────────

const r001: AuditRule = {
  id: 'R-001',
  name: 'Reversibility posture',
  description:
    'Instructions should mention dry-run, confirmation, or "ask before destructive" patterns.',
  severity: 'info',
  category: 'Reliability',
  pillar: 'Reliability',
  owaspAsi: ['ASI-08'],
  agentPromptSnippet: `**R-001 — Reversibility Posture (info)**
Whole-word search for: ${REVERSIBILITY_KEYWORDS.map((k) => `"${k}"`).join(', ')}.
- Zero matches: FAIL — agent will execute destructive operations without confirmation, dry-run, or ask-before-destructive gates.
- One or more: PASS.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, REVERSIBILITY_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} reversibility keyword(s): ${matches.join(', ')}.`
        : 'No reversibility / confirmation posture found. Destructive operations will run without a gate.',
      recommendation: passed
        ? undefined
        : 'Add: "Before any destructive operation (deleting items, sending emails, overwriting data), preview the planned action and ask the user to confirm. Default to dry-run mode if confirmation is not received."',
      evidence: { matchedKeywords: matches },
      owaspAsi: this.owaspAsi,
    };
  },
};

// ── R-002: Loop-break / max-iteration mandate (Tier B) ──────────────────────

const r002: AuditRule = {
  id: 'R-002',
  name: 'Loop-break and max-iteration mandate',
  description:
    'Instructions should cap iteration with explicit max-attempts, max-items, or stop-after-N rules.',
  severity: 'info',
  category: 'Reliability',
  pillar: 'Reliability',
  owaspAsi: ['ASI-02'],
  agentPromptSnippet: `**R-002 — Loop-Break / Max-Iteration Mandate (info)**
Whole-word search for: ${RETRY_LIMIT_KEYWORDS.map((k) => `"${k}"`).join(', ')}.
- Zero matches: FAIL — agent has no explicit loop bound; runaway-loop risk.
- One or more: PASS.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, RETRY_LIMIT_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} loop-break keyword(s): ${matches.join(', ')}.`
        : 'No loop-break or max-iteration mandate found. Agent may run away on retry storms or paginated workloads.',
      recommendation: passed
        ? undefined
        : 'Add explicit caps: "Process at most 50 items per run. Retry failed tool calls at most 2 times then report the error. Stop after 3 consecutive failures."',
      evidence: { matchedKeywords: matches },
      owaspAsi: this.owaspAsi,
    };
  },
};

export const reliabilityRules: AuditRule[] = [r001, r002];
