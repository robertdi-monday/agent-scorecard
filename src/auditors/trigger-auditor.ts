import type { AgentConfig, AuditRule } from '../config/types.js';

/**
 * TR-001 (critical, ASI-08): Self-trigger detection.
 * If a trigger fires on column_change and the agent's tools modify the same column,
 * this can cause infinite execution loops (documented 16.5M token pattern).
 */
const tr001: AuditRule = {
  id: 'TR-001',
  name: 'Self-trigger loop detection',
  description:
    'Column-change triggers must not fire on columns the agent itself modifies.',
  severity: 'critical',
  category: 'Triggers',
  owaspAsi: ['ASI-08'],
  check(config: AgentConfig) {
    const columnChangeTriggers = config.triggers.filter(
      (t) => t.triggerType === 'column_change',
    );

    if (columnChangeTriggers.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No column-change triggers configured.',
      };
    }

    // Collect all columns modified by tools
    const modifiedColumns = new Set<string>();
    for (const tool of config.tools) {
      if (tool.enabled && tool.modifiesColumns) {
        for (const col of tool.modifiesColumns) {
          modifiedColumns.add(col.toLowerCase());
        }
      }
    }

    if (modifiedColumns.size === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message:
          'Column-change trigger(s) found but no tool column modification data available. Cannot determine self-trigger risk.',
        evidence: { reason: 'no-modifiesColumns-data' },
      };
    }

    // Check for overlap
    const conflicts: Array<{
      triggerName: string;
      columnId: string;
    }> = [];

    for (const trigger of columnChangeTriggers) {
      const columnId = trigger.triggerConfig?.columnId;
      if (
        typeof columnId === 'string' &&
        modifiedColumns.has(columnId.toLowerCase())
      ) {
        conflicts.push({ triggerName: trigger.name, columnId });
      }
    }

    const passed = conflicts.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? 'No self-trigger risk detected between column-change triggers and tool modifications.'
        : `Self-trigger risk: ${conflicts.length} trigger(s) fire on column(s) the agent also modifies: ${conflicts.map((c) => `"${c.triggerName}" on column "${c.columnId}"`).join('; ')}.`,
      recommendation: passed
        ? undefined
        : 'Change the trigger to fire on a different column, or remove the tool that modifies the trigger column. Self-triggers can cause infinite loops and massive token consumption.',
      evidence: { conflicts, modifiedColumns: [...modifiedColumns] },
      owaspAsi: this.owaspAsi,
    };
  },
};

/**
 * TR-002 (warning, ASI-08): Trigger should match agent purpose.
 * Heuristic: if trigger type doesn't appear related to the agent goal, warn.
 */
const tr002: AuditRule = {
  id: 'TR-002',
  name: 'Trigger-purpose alignment',
  description:
    'Trigger events should be relevant to the agent purpose described in instructions.',
  severity: 'warning',
  category: 'Triggers',
  owaspAsi: ['ASI-08'],
  check(config: AgentConfig) {
    if (config.triggers.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No triggers configured.',
      };
    }

    // Simple heuristic: check if trigger names/types appear somewhere in the goal or plan
    const instructionText = (
      config.instructions.goal +
      ' ' +
      config.instructions.plan
    ).toLowerCase();
    const mismatched: string[] = [];

    for (const trigger of config.triggers) {
      const triggerWords = trigger.name
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 3);

      // A trigger is "aligned" if at least one meaningful word from its name appears in the instructions
      const hasOverlap = triggerWords.some((word) =>
        instructionText.includes(word),
      );

      if (!hasOverlap) {
        mismatched.push(trigger.name);
      }
    }

    const passed = mismatched.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `All ${config.triggers.length} trigger(s) appear aligned with the agent purpose.`
        : `${mismatched.length} trigger(s) may not match the agent purpose: ${mismatched.join(', ')}.`,
      recommendation: passed
        ? undefined
        : 'Review trigger configuration to ensure events are relevant to the agent goal.',
      evidence: { mismatchedTriggers: mismatched },
      owaspAsi: this.owaspAsi,
    };
  },
};

export const triggerRules: AuditRule[] = [tr001, tr002];
