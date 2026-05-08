import type { AgentConfig, AuditRule } from '../config/types.js';
import {
  INSTRUCTION_MIN_LENGTH,
  INSTRUCTION_MAX_LENGTH,
  GUARDRAIL_KEYWORDS,
  ERROR_HANDLING_KEYWORDS,
  SCOPE_BOUNDARY_KEYWORDS,
} from '../config/constants.js';

/** Combine all instruction text for analysis. */
function getInstructionText(config: AgentConfig): string {
  return [
    config.instructions.goal,
    config.instructions.plan,
    config.instructions.userPrompt,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Case-insensitive keyword scan — returns matched keywords. */
function findKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * IN-001 (warning): Instruction text length — too short or too long.
 */
const in001: AuditRule = {
  id: 'IN-001',
  name: 'Instruction length',
  description: `Combined instruction text should be between ${INSTRUCTION_MIN_LENGTH} and ${INSTRUCTION_MAX_LENGTH} characters.`,
  severity: 'warning',
  category: 'Instructions',
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const len = text.length;

    if (len < INSTRUCTION_MIN_LENGTH) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: false,
        message: `Instructions are too short (${len} chars, minimum ${INSTRUCTION_MIN_LENGTH}). Vague instructions lead to unpredictable agent behavior.`,
        recommendation:
          'Add detailed instructions covering the agent goal, expected behavior, constraints, and error handling.',
        evidence: { length: len, threshold: INSTRUCTION_MIN_LENGTH },
      };
    }

    if (len > INSTRUCTION_MAX_LENGTH) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: false,
        message: `Instructions are too long (${len} chars, maximum ${INSTRUCTION_MAX_LENGTH}). Overly complex instructions may confuse the agent.`,
        recommendation:
          'Simplify instructions. Move reference material to the knowledge base and keep instructions focused on behavior rules.',
        evidence: { length: len, threshold: INSTRUCTION_MAX_LENGTH },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed: true,
      message: `Instruction length is appropriate (${len} chars).`,
      evidence: { length: len },
    };
  },
};

/**
 * IN-002 (critical, ASI-01): Instructions must contain guardrail keywords.
 */
const in002: AuditRule = {
  id: 'IN-002',
  name: 'Guardrail presence',
  description:
    'Instructions must include explicit guardrails (e.g., "never fabricate", "escalate if unsure").',
  severity: 'critical',
  category: 'Instructions',
  owaspAsi: ['ASI-01'],
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, GUARDRAIL_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} guardrail keyword(s): ${matches.join(', ')}.`
        : 'No guardrail keywords found in instructions. The agent has no explicit constraints against fabrication or hallucination.',
      recommendation: passed
        ? undefined
        : 'Add explicit guardrails such as "never fabricate information", "escalate if unsure", or "do not guess when data is unavailable".',
      evidence: { matchedKeywords: matches },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * IN-003 (warning): Instructions should contain error-handling guidance.
 */
const in003: AuditRule = {
  id: 'IN-003',
  name: 'Error-handling guidance',
  description:
    'Instructions should include guidance for handling errors and missing data.',
  severity: 'warning',
  category: 'Instructions',
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, ERROR_HANDLING_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} error-handling keyword(s): ${matches.join(', ')}.`
        : 'No error-handling guidance found in instructions.',
      recommendation: passed
        ? undefined
        : 'Add instructions for how the agent should behave when tools fail, data is missing, or errors occur.',
      evidence: { matchedKeywords: matches },
    };
  },
};

/**
 * IN-004 (warning, ASI-01): Instructions should define scope boundaries.
 */
const in004: AuditRule = {
  id: 'IN-004',
  name: 'Scope boundary definition',
  description:
    'Instructions should explicitly define what the agent should NOT do.',
  severity: 'warning',
  category: 'Instructions',
  owaspAsi: ['ASI-01'],
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, SCOPE_BOUNDARY_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} scope boundary keyword(s): ${matches.join(', ')}.`
        : 'No scope boundary definitions found in instructions.',
      recommendation: passed
        ? undefined
        : 'Add explicit boundaries such as "only operate on the X board", "do not access Y", or "restricted to Z tasks".',
      evidence: { matchedKeywords: matches },
      owaspAsi: this.owaspAsi,
    };
  },
};

export const instructionRules: AuditRule[] = [in001, in002, in003, in004];
