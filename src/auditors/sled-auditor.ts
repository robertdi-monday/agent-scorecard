import type { AgentConfig, AuditRule } from '../config/types.js';
import {
  DEADLINE_KEYWORDS,
  FINANCIAL_NO_FABRICATION_KEYWORDS,
  FINANCIAL_CONTEXT_KEYWORDS,
  ELIGIBILITY_FILE_KEYWORDS,
  COMPLIANCE_KEYWORDS,
} from '../config/constants.js';

const VERTICAL = 'sled-grant';

/** Case-insensitive keyword scan. */
function findKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

function getInstructionText(config: AgentConfig): string {
  return [
    config.instructions.goal,
    config.instructions.plan,
    config.instructions.userPrompt,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * SLED-001 (critical): Instructions must mention deadline accuracy/verification.
 */
const sled001: AuditRule = {
  id: 'SLED-001',
  name: 'Deadline accuracy instructions',
  description:
    'SLED grant agents must include instructions about verifying deadline accuracy.',
  severity: 'critical',
  category: 'SLED Vertical',
  vertical: VERTICAL,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, DEADLINE_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found deadline-related keyword(s): ${matches.join(', ')}.`
        : 'No deadline accuracy instructions found. Grant agents must verify submission deadlines.',
      recommendation: passed
        ? undefined
        : 'Add instructions requiring the agent to verify deadlines against official sources and never assume or fabricate dates.',
      evidence: { matchedKeywords: matches },
    };
  },
};

/**
 * SLED-002 (critical): Instructions must mention not fabricating financial figures.
 * Requires BOTH a no-fabrication keyword AND a financial context keyword.
 */
const sled002: AuditRule = {
  id: 'SLED-002',
  name: 'Financial no-fabrication rule',
  description:
    'SLED grant agents must explicitly prohibit fabrication of financial figures.',
  severity: 'critical',
  category: 'SLED Vertical',
  vertical: VERTICAL,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const fabMatches = findKeywords(text, FINANCIAL_NO_FABRICATION_KEYWORDS);
    const finMatches = findKeywords(text, FINANCIAL_CONTEXT_KEYWORDS);

    const passed = fabMatches.length > 0 && finMatches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found no-fabrication keyword(s) (${fabMatches.join(', ')}) combined with financial context (${finMatches.join(', ')}).`
        : fabMatches.length === 0 && finMatches.length === 0
          ? 'No financial no-fabrication instructions found. Grant agents must not invent dollar amounts or funding figures.'
          : fabMatches.length === 0
            ? 'Financial context found but no explicit no-fabrication rule for financial data.'
            : 'No-fabrication rule found but no financial context keywords. Ensure the rule explicitly covers financial figures.',
      recommendation: passed
        ? undefined
        : 'Add instructions such as "never fabricate grant amounts" or "do not invent funding figures — always reference official sources".',
      evidence: {
        fabricationKeywords: fabMatches,
        financialKeywords: finMatches,
      },
    };
  },
};

/**
 * SLED-003 (warning): Knowledge base should include eligibility-related files.
 */
const sled003: AuditRule = {
  id: 'SLED-003',
  name: 'Eligibility knowledge files',
  description:
    'SLED grant agents should have knowledge base files covering eligibility criteria.',
  severity: 'warning',
  category: 'SLED Vertical',
  vertical: VERTICAL,
  check(config: AgentConfig) {
    const files = config.knowledgeBase.files;
    if (files.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: false,
        message:
          'Knowledge base is empty. SLED grant agents need eligibility reference material.',
        recommendation:
          'Upload files covering grant eligibility criteria, requirements, and qualifications.',
      };
    }

    const matchingFiles = files.filter((f) => {
      const nameLower = f.fileName.toLowerCase();
      return ELIGIBILITY_FILE_KEYWORDS.some((kw) => nameLower.includes(kw));
    });

    const passed = matchingFiles.length > 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matchingFiles.length} eligibility-related file(s): ${matchingFiles.map((f) => f.fileName).join(', ')}.`
        : 'No eligibility-related files found in knowledge base.',
      recommendation: passed
        ? undefined
        : 'Add files covering grant eligibility criteria, qualification requirements, or program guidelines.',
      evidence: {
        matchingFiles: matchingFiles.map((f) => f.fileName),
        checkedKeywords: ELIGIBILITY_FILE_KEYWORDS,
      },
    };
  },
};

/**
 * SLED-004 (warning): Instructions should reference compliance terms.
 */
const sled004: AuditRule = {
  id: 'SLED-004',
  name: 'Compliance term references',
  description:
    'SLED grant agent instructions should reference relevant compliance frameworks.',
  severity: 'warning',
  category: 'SLED Vertical',
  vertical: VERTICAL,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, COMPLIANCE_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found compliance reference(s): ${matches.join(', ')}.`
        : 'No compliance framework references found in instructions.',
      recommendation: passed
        ? undefined
        : 'Reference relevant compliance frameworks such as EDGAR, SAM.gov, Grants.gov, OMB Uniform Guidance, or applicable federal regulations.',
      evidence: { matchedKeywords: matches },
    };
  },
};

export const sledRules: AuditRule[] = [sled001, sled002, sled003, sled004];
