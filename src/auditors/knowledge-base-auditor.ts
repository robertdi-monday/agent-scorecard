import type { AgentConfig, AuditRule } from '../config/types.js';
import {
  KB_STALENESS_DAYS,
  ELIGIBILITY_FILE_KEYWORDS,
} from '../config/constants.js';

/**
 * KB-001 (critical): Knowledge base must have at least one file.
 */
const kb001: AuditRule = {
  id: 'KB-001',
  name: 'Knowledge base not empty',
  description: 'Agent must have at least one knowledge base file uploaded.',
  severity: 'critical',
  category: 'Knowledge Base',
  check(config: AgentConfig) {
    const passed = config.knowledgeBase.files.length > 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Knowledge base has ${config.knowledgeBase.files.length} file(s).`
        : 'Knowledge base is empty. The agent has no reference material.',
      recommendation: passed
        ? undefined
        : 'Upload relevant documents to the knowledge base so the agent can ground its responses in factual content.',
      evidence: { fileCount: config.knowledgeBase.files.length },
    };
  },
};

/**
 * KB-002 (warning): Knowledge base files should be relevant to the agent's goal.
 * Heuristic: tokenize the goal, check if any file names contain goal-relevant terms.
 */
const kb002: AuditRule = {
  id: 'KB-002',
  name: 'Knowledge base relevance',
  description:
    'Knowledge base file names should contain terms related to the agent goal.',
  severity: 'warning',
  category: 'Knowledge Base',
  check(config: AgentConfig) {
    const files = config.knowledgeBase.files;
    if (files.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No files to check (KB is empty — see KB-001).',
      };
    }

    // Extract meaningful words from the goal (3+ chars, lowercased)
    const goalWords = config.instructions.goal
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3);

    const fileNames = files.map((f) => f.fileName.toLowerCase());
    const matchingFiles = fileNames.filter((name) =>
      goalWords.some((word) => name.includes(word)),
    );

    const passed = matchingFiles.length > 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `${matchingFiles.length} of ${files.length} file(s) appear relevant to the agent goal.`
        : 'No knowledge base files appear related to the agent goal. File names lack goal-relevant keywords.',
      recommendation: passed
        ? undefined
        : 'Rename files to clearly reflect their content, or add files that match the agent purpose.',
      evidence: { goalWords: goalWords.slice(0, 10), fileNames },
    };
  },
};

/**
 * KB-003 (info): Knowledge base files should not be stale (>90 days old).
 */
const kb003: AuditRule = {
  id: 'KB-003',
  name: 'Knowledge base freshness',
  description: `Knowledge base files should have been updated within the last ${KB_STALENESS_DAYS} days.`,
  severity: 'info',
  category: 'Knowledge Base',
  check(config: AgentConfig) {
    const files = config.knowledgeBase.files;
    if (files.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No files to check (KB is empty — see KB-001).',
      };
    }

    const now = Date.now();
    const thresholdMs = KB_STALENESS_DAYS * 24 * 60 * 60 * 1000;
    const staleFiles: string[] = [];
    const invalidTimestampFiles: string[] = [];
    let hasTimestamp = false;

    for (const file of files) {
      if (!file.lastUpdated) continue;
      hasTimestamp = true;
      const updatedAt = new Date(file.lastUpdated).getTime();
      if (Number.isNaN(updatedAt)) {
        invalidTimestampFiles.push(file.fileName);
        continue;
      }
      if (now - updatedAt > thresholdMs) {
        staleFiles.push(file.fileName);
      }
    }

    if (invalidTimestampFiles.length > 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: false,
        message: `${invalidTimestampFiles.length} file(s) have invalid lastUpdated values (not parseable as dates): ${invalidTimestampFiles.join(', ')}.`,
        recommendation:
          'Use ISO 8601 timestamps for lastUpdated (e.g. 2026-04-15T00:00:00Z) so freshness can be audited.',
        evidence: { invalidTimestampFiles },
      };
    }

    if (!hasTimestamp) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message:
          'Unable to determine staleness: no lastUpdated timestamps on knowledge base files.',
        evidence: { reason: 'no-timestamps' },
      };
    }

    const passed = staleFiles.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `All knowledge base files with timestamps were updated within the last ${KB_STALENESS_DAYS} days.`
        : `${staleFiles.length} file(s) are stale (not updated in ${KB_STALENESS_DAYS}+ days): ${staleFiles.join(', ')}.`,
      recommendation: passed
        ? undefined
        : 'Review and update stale knowledge base files to ensure the agent uses current information.',
      evidence: { staleFiles },
    };
  },
};

export const knowledgeBaseRules: AuditRule[] = [kb001, kb002, kb003];
