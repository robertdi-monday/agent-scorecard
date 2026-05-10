import type {
  AgentConfig,
  AuditContext,
  AuditResult,
  AuditRule,
} from '../config/types.js';
import { knowledgeBaseRules } from './knowledge-base-auditor.js';
import { permissionRules } from './permission-auditor.js';
import { toolRules } from './tool-auditor.js';
import { triggerRules } from './trigger-auditor.js';
import { instructionRules } from './instruction-auditor.js';
import { efficiencyRules } from './efficiency-auditor.js';
import { securityRules } from './security-auditor.js';
import { sledRules } from './sled-auditor.js';

/** All universal rules (no vertical filter). */
const BASE_RULES: AuditRule[] = [
  ...knowledgeBaseRules,
  ...permissionRules,
  ...toolRules,
  ...triggerRules,
  ...instructionRules,
  ...efficiencyRules,
  ...securityRules,
];

/** Vertical-specific rule packs keyed by vertical name. */
const VERTICAL_RULES: Record<string, AuditRule[]> = {
  'sled-grant': sledRules,
};

/**
 * Get the applicable rules for a given vertical.
 * Universal rules always run; vertical rules are added when a vertical is specified.
 */
export function getRulesForVertical(vertical?: string): AuditRule[] {
  const rules = [...BASE_RULES];
  if (vertical && VERTICAL_RULES[vertical]) {
    rules.push(...VERTICAL_RULES[vertical]);
  }
  return rules;
}

/**
 * Run all applicable audit rules against the config and return results.
 */
export function runAudit(
  config: AgentConfig,
  vertical?: string,
  context?: AuditContext,
): AuditResult[] {
  const rules = getRulesForVertical(vertical);
  return rules.map((rule) => rule.check(config, context));
}
