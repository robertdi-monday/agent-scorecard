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
import { completenessRules } from './completeness-auditor.js';
import { qualityRules } from './quality-auditor.js';
import { efficiencyRules } from './efficiency-auditor.js';
import { safetyRules } from './safety-auditor.js';
import { securityRules } from './security-auditor.js';
import { observabilityRules } from './observability-auditor.js';
import { reliabilityRules } from './reliability-auditor.js';
import { sledRules } from './sled-auditor.js';

/** All universal rules (no vertical filter). */
const BASE_RULES: AuditRule[] = [
  ...knowledgeBaseRules,
  ...permissionRules,
  ...toolRules,
  ...triggerRules,
  ...completenessRules,
  ...qualityRules,
  ...efficiencyRules,
  ...safetyRules,
  ...securityRules,
  ...observabilityRules,
  ...reliabilityRules,
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
 * Each result is annotated with its source rule's `pillar` (if defined),
 * which downstream scoring uses to bucket into per-pillar reports.
 */
export function runAudit(
  config: AgentConfig,
  vertical?: string,
  context?: AuditContext,
): AuditResult[] {
  const rules = getRulesForVertical(vertical);
  return rules.map((rule) => {
    const result = rule.check(config, context);
    if (rule.pillar && !result.pillar) {
      return { ...result, pillar: rule.pillar };
    }
    return result;
  });
}
