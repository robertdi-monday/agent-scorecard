import type { AgentConfig, AuditRule } from '../config/types.js';
import { findKeywords, getInstructionText } from './auditor-utils.js';
import {
  OBSERVABILITY_KEYWORDS,
  CITATION_KEYWORDS,
} from '../config/constants.js';

// ── O-001: Decision-log mandate (Tier B, hybrid keyword + LLM verify) ──────

/**
 * O-001 fires when the instructions don't reference any logging / decision-trail /
 * reasoning-trace requirement. The rule is hybrid: the deterministic check below
 * is the keyword pre-filter, and `lr-011-decision-log.ts` runs the LLM
 * verification. Failing the keyword check is enough to FAIL O-001 deterministically;
 * passing the keyword check passes the deterministic stage and defers structural
 * validation to LR-011.
 */
const o001: AuditRule = {
  id: 'O-001',
  name: 'Decision-log mandate',
  description:
    'Instructions should require the agent to log decisions, cite sources, or explain reasoning.',
  severity: 'warning',
  category: 'Observability',
  pillar: 'Observability',
  owaspAsi: ['ASI-09'],
  agentPromptSnippet: `**O-001 — Decision-Log Mandate (warning, NIST MEASURE)**
Whole-word search for: ${OBSERVABILITY_KEYWORDS.map((k) => `"${k}"`).join(', ')}.
- Zero matches: FAIL — agent has no obligation to log decisions or explain reasoning, blocking downstream auditability.
- One or more: PASS (LR-011 verifies the obligation is structural).`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, OBSERVABILITY_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} observability keyword(s): ${matches.join(', ')}.`
        : "No decision-log or reasoning-trace mandate found in instructions. The agent's decisions cannot be audited after the fact.",
      recommendation: passed
        ? undefined
        : 'Add a clause requiring the agent to log every decision, cite the source data it relied on, or explain its reasoning step before acting. Example: "For each action, briefly explain why you chose it and which data informed the decision."',
      evidence: { matchedKeywords: matches },
      owaspAsi: this.owaspAsi,
    };
  },
};

// ── O-002: Provenance / citation requirement (Tier B, hybrid) ──────────────

const o002: AuditRule = {
  id: 'O-002',
  name: 'Provenance and citation requirement',
  description:
    'Instructions should require the agent to cite the source for any factual claim.',
  severity: 'warning',
  category: 'Observability',
  pillar: 'Observability',
  agentPromptSnippet: `**O-002 — Provenance / Citation Requirement (warning)**
Whole-word search for: ${CITATION_KEYWORDS.map((k) => `"${k}"`).join(', ')}.
- Zero matches: FAIL — agent has no obligation to cite the KB file or item ID for factual claims; hallucinations become invisible.
- One or more: PASS.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, CITATION_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} citation keyword(s): ${matches.join(', ')}.`
        : 'No citation or source-attribution requirement found. Hallucinated claims will pass through undetected.',
      recommendation: passed
        ? undefined
        : 'Add: "When stating a fact, cite the KB file name or board item ID it came from. If you cannot cite a source, say so explicitly rather than asserting the claim."',
      evidence: { matchedKeywords: matches },
    };
  },
};

export const observabilityRules: AuditRule[] = [o001, o002];
