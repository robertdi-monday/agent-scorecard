import type { AgentConfig, AuditContext, AuditRule } from '../config/types.js';

const SCOPE_RANK: Record<string, number> = {
  custom: 0,
  board: 1,
  workspace: 2,
};

/**
 * PM-001 (critical, ASI-03): Workspace-wide permissions when narrower scope would work.
 */
const pm001: AuditRule = {
  id: 'PM-001',
  name: 'Least-privilege permissions',
  description:
    'Agent should use board/custom scoping rather than workspace-wide permissions.',
  severity: 'critical',
  category: 'Permissions',
  owaspAsi: ['ASI-03'],
  check(config: AgentConfig) {
    const passed = config.permissions.scopeType !== 'workspace';
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Permissions are scoped to '${config.permissions.scopeType}' level (${config.permissions.connectedBoards.length} board(s), ${config.permissions.connectedDocs.length} doc(s)).`
        : 'Agent has workspace-wide permissions. This grants access to all boards and documents in the workspace.',
      recommendation: passed
        ? undefined
        : 'Narrow the agent scope to specific boards and documents it needs. Use board-level or custom scoping.',
      evidence: {
        scopeType: config.permissions.scopeType,
        boardCount: config.permissions.connectedBoards.length,
        docCount: config.permissions.connectedDocs.length,
      },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * PM-002 (warning, ASI-03): Child agent permissions should not exceed parent.
 * When parentAgentId is set but no parent config is provided, returns info-level pass.
 * When parent config is provided via AuditContext, performs real scope comparison.
 */
const pm002: AuditRule = {
  id: 'PM-002',
  name: 'Child agent permission inheritance',
  description:
    'If a parent agent exists, child permissions should not exceed parent scope.',
  severity: 'warning',
  category: 'Permissions',
  owaspAsi: ['ASI-03'],
  check(config: AgentConfig, context?: AuditContext) {
    if (!config.permissions.parentAgentId) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message:
          'No parent agent configured; parent/child permission check not applicable.',
      };
    }

    if (!context?.parentConfig) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: 'info' as const,
        passed: true,
        message: `Agent has parent agent (${config.permissions.parentAgentId}). Parent config not provided — manual review recommended.`,
        recommendation:
          'Use --parent-config to supply the parent agent config for automated scope comparison.',
        evidence: { parentAgentId: config.permissions.parentAgentId },
        owaspAsi: this.owaspAsi,
      };
    }

    const parentPerms = context.parentConfig.permissions;
    const childPerms = config.permissions;
    const childRank = SCOPE_RANK[childPerms.scopeType] ?? 0;
    const parentRank = SCOPE_RANK[parentPerms.scopeType] ?? 0;
    const violations: string[] = [];

    if (childRank > parentRank) {
      violations.push(
        `Child scope '${childPerms.scopeType}' is broader than parent scope '${parentPerms.scopeType}'`,
      );
    }

    const parentBoardSet = new Set(parentPerms.connectedBoards);
    const extraBoards = childPerms.connectedBoards.filter(
      (b) => !parentBoardSet.has(b),
    );
    if (extraBoards.length > 0) {
      violations.push(
        `Child has ${extraBoards.length} board(s) not in parent: ${extraBoards.join(', ')}`,
      );
    }

    const parentDocSet = new Set(parentPerms.connectedDocs);
    const extraDocs = childPerms.connectedDocs.filter(
      (d) => !parentDocSet.has(d),
    );
    if (extraDocs.length > 0) {
      violations.push(
        `Child has ${extraDocs.length} doc(s) not in parent: ${extraDocs.join(', ')}`,
      );
    }

    const passed = violations.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Child permissions do not exceed parent agent (${config.permissions.parentAgentId}).`
        : `Child permissions exceed parent agent: ${violations.join('; ')}.`,
      recommendation: passed
        ? undefined
        : 'Narrow child agent permissions to be a subset of the parent agent.',
      evidence: {
        parentAgentId: config.permissions.parentAgentId,
        childScope: childPerms.scopeType,
        parentScope: parentPerms.scopeType,
        violations,
      },
      owaspAsi: this.owaspAsi,
    };
  },
};

export const permissionRules: AuditRule[] = [pm001, pm002];
