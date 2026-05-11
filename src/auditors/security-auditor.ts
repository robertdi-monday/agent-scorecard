import type { AgentConfig, AuditRule } from '../config/types.js';
import { getInstructionText, findKeywords } from './auditor-utils.js';
import {
  DATA_HANDLING_KEYWORDS,
  HUMAN_LOOP_KEYWORDS,
  WRITE_GUARD_KEYWORDS,
  URL_RESTRICTION_KEYWORDS,
  OUTPUT_VALIDATION_KEYWORDS,
  SENSITIVE_COLUMN_PATTERNS,
  EXTERNAL_TOOL_PATTERNS,
  WRITE_TOOL_PATTERNS,
  BOARD_WRITE_TOOL_PATTERNS,
} from '../config/constants.js';

// Full-mode-only rules (no `pillar` — require tools / KB to evaluate).
// S-001 and S-002 (instruction-text checks) moved to safety-auditor.ts.
//
// OWASP ASI mappings refreshed to the December 2025 official taxonomy:
//   ASI-02 = Tool Misuse / Resource Overload
//   ASI-03 = Privilege Compromise
//   ASI-04 = Supply Chain
//   ASI-05 = RCE / Code Attacks
//   ASI-06 = Memory & Context Poisoning
//   ASI-08 = Repudiation & Untraceability
//   ASI-09 = Human-Agent Trust

/**
 * SC-002 (critical, ASI-09): Data exfiltration guard.
 * Re-mapped from ASI-04 → ASI-09 (exfiltration is a Human-Agent Trust failure
 * in the Dec 2025 taxonomy; ASI-04 is now Supply Chain).
 */
const sc002: AuditRule = {
  id: 'SC-002',
  name: 'Data exfiltration guard',
  description:
    'Agents with both read and write capabilities must have data handling restrictions.',
  severity: 'critical',
  category: 'Security',
  owaspAsi: ['ASI-09'],
  check(config: AgentConfig) {
    const enabledTools = config.tools.filter((t) => t.enabled);
    const readTools = enabledTools.filter(
      (t) => t.type === 'builtin' || t.type === 'app-feature',
    );
    const writeTools = enabledTools.filter((t) =>
      WRITE_TOOL_PATTERNS.some((p) => t.name.toLowerCase().includes(p)),
    );

    if (readTools.length === 0 || writeTools.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message:
          'Agent does not have both read and write tool capabilities. Data exfiltration risk is low.',
        evidence: {
          readTools: readTools.map((t) => t.name),
          writeTools: writeTools.map((t) => t.name),
        },
        owaspAsi: this.owaspAsi,
      };
    }

    const text = getInstructionText(config);
    const matches = findKeywords(text, DATA_HANDLING_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Data handling restrictions found: ${matches.join(', ')}.`
        : 'Agent has both data-read and data-write capabilities but no data handling restrictions. Risk of data exfiltration (OWASP ASI-09: Human-Agent Trust).',
      recommendation: passed
        ? undefined
        : 'Add explicit data handling instructions: "do not send board data via email", "keep all data within monday.com", or "do not export sensitive information to external services".',
      evidence: {
        readTools: readTools.map((t) => t.name),
        writeTools: writeTools.map((t) => t.name),
        matchedKeywords: matches,
      },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * SC-003 (warning, ASI-08): Excessive autonomy check.
 * Re-mapped from ASI-05 → ASI-08 (unconstrained autonomy is a
 * Repudiation & Untraceability problem, not RCE).
 */
const sc003: AuditRule = {
  id: 'SC-003',
  name: 'Excessive autonomy check',
  description:
    'Account-level agents with many tools need human-in-the-loop safeguards.',
  severity: 'warning',
  category: 'Security',
  owaspAsi: ['ASI-08'],
  check(config: AgentConfig) {
    const enabledCount = config.tools.filter((t) => t.enabled).length;

    if (config.kind !== 'ACCOUNT_LEVEL' || enabledCount <= 5) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message:
          config.kind !== 'ACCOUNT_LEVEL'
            ? `Agent is ${config.kind} — excessive autonomy risk is lower.`
            : `Agent has ${enabledCount} tools (≤5) — autonomy level is acceptable.`,
        owaspAsi: this.owaspAsi,
      };
    }

    const text = getInstructionText(config);
    const matches = findKeywords(text, HUMAN_LOOP_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Human-in-the-loop safeguards found: ${matches.join(', ')}.`
        : `Account-level agent with ${enabledCount} tools and no human-in-the-loop safeguards. High risk of unattributable autonomous actions (OWASP ASI-08: Repudiation & Untraceability).`,
      recommendation: passed
        ? undefined
        : 'Add human approval gates for destructive or high-impact operations: "ask for approval before deleting items", "require confirmation before sending emails".',
      evidence: { enabledToolCount: enabledCount, matchedKeywords: matches },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * SC-004 (warning, ASI-03): Sensitive column write guard.
 * ASI-03 (Privilege Compromise) retained — sensitive-column writes are a
 * privilege-escalation surface.
 */
const sc004: AuditRule = {
  id: 'SC-004',
  name: 'Sensitive column write guard',
  description:
    'Tools that modify sensitive columns need write-guard instructions.',
  severity: 'warning',
  category: 'Security',
  owaspAsi: ['ASI-03'],
  check(config: AgentConfig) {
    const sensitiveColumns: string[] = [];
    const toolsModifying: string[] = [];

    for (const tool of config.tools) {
      if (!tool.enabled || !tool.modifiesColumns) continue;
      for (const col of tool.modifiesColumns) {
        const colLower = col.toLowerCase();
        if (SENSITIVE_COLUMN_PATTERNS.some((p) => colLower.includes(p))) {
          if (!sensitiveColumns.includes(col)) sensitiveColumns.push(col);
          if (!toolsModifying.includes(tool.name))
            toolsModifying.push(tool.name);
        }
      }
    }

    if (sensitiveColumns.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No tools modify sensitive columns.',
        owaspAsi: this.owaspAsi,
      };
    }

    const text = getInstructionText(config);
    const matches = findKeywords(text, WRITE_GUARD_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Write-guard instructions found for sensitive columns: ${matches.join(', ')}.`
        : `Agent modifies sensitive columns (${sensitiveColumns.join(', ')}) without write-guard instructions.`,
      recommendation: passed
        ? undefined
        : 'Add conditional write guards: "only update status after verifying all criteria", "do not overwrite owner assignments without approval".',
      evidence: {
        sensitiveColumns,
        toolsModifyingThem: toolsModifying,
        matchedKeywords: matches,
      },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * SC-005 (critical, ASI-02): External tool URL restrictions.
 * Re-mapped from ASI-06 → ASI-02 (SSRF / unrestricted external tool calls
 * are now classified under Tool Misuse / Resource Overload; ASI-06 is
 * Memory & Context Poisoning in the Dec 2025 taxonomy).
 */
const sc005: AuditRule = {
  id: 'SC-005',
  name: 'External tool URL restrictions',
  description:
    'Agents with external web access tools must have URL restrictions.',
  severity: 'critical',
  category: 'Security',
  owaspAsi: ['ASI-02'],
  check(config: AgentConfig) {
    const enabledTools = config.tools.filter((t) => t.enabled);
    const externalTools = enabledTools.filter(
      (t) =>
        t.type === 'custom' ||
        EXTERNAL_TOOL_PATTERNS.some((p) => t.name.toLowerCase().includes(p)),
    );

    if (externalTools.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No external web access tools detected.',
        owaspAsi: this.owaspAsi,
      };
    }

    const text = getInstructionText(config);
    const matches = findKeywords(text, URL_RESTRICTION_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `URL restriction keywords found: ${matches.join(', ')}.`
        : 'Agent has external web access tools but no URL restrictions. Risk of SSRF or runaway external calls (OWASP ASI-02: Tool Misuse).',
      recommendation: passed
        ? undefined
        : 'Add URL restrictions: "only access approved domains: [domain1, domain2]", "do not fetch URLs from user input without validation".',
      evidence: {
        externalTools: externalTools.map((t) => t.name),
        matchedKeywords: matches,
      },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * SC-006 (warning, ASI-09): Output sanitization check.
 * ASI-09 (Human-Agent Trust) retained — corrupt output erodes the trust
 * boundary between agent and operator.
 */
const sc006: AuditRule = {
  id: 'SC-006',
  name: 'Output sanitization check',
  description:
    'Agents that write to boards/items should validate output before writing.',
  severity: 'warning',
  category: 'Security',
  owaspAsi: ['ASI-09'],
  check(config: AgentConfig) {
    const enabledTools = config.tools.filter((t) => t.enabled);
    const writeTools = enabledTools.filter((t) =>
      BOARD_WRITE_TOOL_PATTERNS.some((p) => t.name.toLowerCase().includes(p)),
    );

    if (writeTools.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No board write tools detected.',
        owaspAsi: this.owaspAsi,
      };
    }

    const text = getInstructionText(config);
    const matches = findKeywords(text, OUTPUT_VALIDATION_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Output validation keywords found: ${matches.join(', ')}.`
        : 'Agent writes to boards/items without output validation instructions. Risk of data corruption (OWASP ASI-09: Human-Agent Trust).',
      recommendation: passed
        ? undefined
        : 'Add output validation: "validate output format before writing to board", "verify data integrity before updating columns".',
      evidence: {
        writeTools: writeTools.map((t) => t.name),
        matchedKeywords: matches,
      },
      owaspAsi: this.owaspAsi,
    };
  },
};

export const securityRules: AuditRule[] = [sc002, sc003, sc004, sc005, sc006];
