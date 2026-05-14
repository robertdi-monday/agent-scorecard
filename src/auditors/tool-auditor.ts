import type { AgentConfig, AuditRule } from '../config/types.js';
import { UNNECESSARY_TOOL_PATTERNS } from '../config/constants.js';

/**
 * TL-001 (warning): Flag tools likely unnecessary for agent's stated purpose.
 */
const tl001: AuditRule = {
  id: 'TL-001',
  name: 'Tool necessity',
  description:
    "Enabled tools should be relevant to the agent's stated goal and plan.",
  severity: 'warning',
  category: 'Tools',
  owaspAsi: ['ASI-02'],
  check(config: AgentConfig) {
    const enabledTools = config.tools.filter((t) => t.enabled);
    if (enabledTools.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No tools enabled; nothing to check.',
      };
    }

    const goalLower = (
      config.instructions.goal +
      ' ' +
      config.instructions.plan
    ).toLowerCase();
    const flaggedTools: string[] = [];

    for (const pattern of UNNECESSARY_TOOL_PATTERNS) {
      const goalMatches = pattern.goalKeywords.some((kw) =>
        goalLower.includes(kw),
      );
      if (!goalMatches) continue;

      for (const tool of enabledTools) {
        const toolNameLower = tool.name.toLowerCase();
        const displayLower = (tool.displayName || '').toLowerCase();
        if (
          pattern.unnecessaryTools.some(
            (ut) => toolNameLower.includes(ut) || displayLower.includes(ut),
          )
        ) {
          flaggedTools.push(tool.displayName || tool.name);
        }
      }
    }

    const uniqueFlagged = [...new Set(flaggedTools)];
    const passed = uniqueFlagged.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `All ${enabledTools.length} enabled tool(s) appear relevant to the agent purpose.`
        : `${uniqueFlagged.length} tool(s) may be unnecessary for this agent: ${uniqueFlagged.join(', ')}.`,
      recommendation: passed
        ? undefined
        : 'Disable tools that are not needed for the agent purpose to reduce attack surface.',
      evidence: { flaggedTools: uniqueFlagged },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * TL-002 (critical): Any tool with connectionStatus === 'not_connected'.
 */
const tl002: AuditRule = {
  id: 'TL-002',
  name: 'Tool connection status',
  description: 'All enabled tools must be connected and operational.',
  severity: 'critical',
  category: 'Tools',
  owaspAsi: ['ASI-02'],
  check(config: AgentConfig) {
    const enabledTools = config.tools.filter((t) => t.enabled);
    const disconnected = enabledTools.filter(
      (t) => t.connectionStatus === 'not_connected',
    );

    if (enabledTools.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No tools enabled; nothing to check.',
      };
    }

    const passed = disconnected.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `All ${enabledTools.length} enabled tool(s) are connected.`
        : `${disconnected.length} enabled tool(s) are not connected: ${disconnected.map((t) => t.displayName || t.name).join(', ')}.`,
      recommendation: passed
        ? undefined
        : 'Connect or disable disconnected tools. A disconnected tool will cause runtime failures.',
      evidence: {
        disconnectedTools: disconnected.map((t) => ({
          name: t.name,
          displayName: t.displayName,
        })),
      },
      owaspAsi: this.owaspAsi,
    };
  },
};

export const toolRules: AuditRule[] = [tl001, tl002];
