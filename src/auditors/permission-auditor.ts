import type { AgentConfig, AuditRule } from '../config/types.js';

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
 * Informational — can only flag when parentAgentId is set.
 */
const pm002: AuditRule = {
  id: 'PM-002',
  name: 'Child agent permission inheritance',
  description:
    'If a parent agent exists, child permissions should not exceed parent scope.',
  severity: 'warning',
  category: 'Permissions',
  owaspAsi: ['ASI-03'],
  check(config: AgentConfig) {
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

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed: false,
      message: `Agent has parent agent (${config.permissions.parentAgentId}). Child permissions cannot be verified without parent config — flagging for manual review.`,
      recommendation:
        'Verify that this agent does not have broader permissions than its parent agent.',
      evidence: { parentAgentId: config.permissions.parentAgentId },
      owaspAsi: this.owaspAsi,
    };
  },
};

export const permissionRules: AuditRule[] = [pm001, pm002];
