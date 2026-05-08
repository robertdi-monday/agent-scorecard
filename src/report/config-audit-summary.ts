import type { AuditResult } from '../config/types.js';

/** Roll up config-audit result counts (critical vs warning vs info failures). */
export function summarizeConfigAuditLayer(results: AuditResult[]) {
  return {
    totalChecks: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed && r.severity === 'critical')
      .length,
    warnings: results.filter((r) => !r.passed && r.severity === 'warning')
      .length,
    infoIssues: results.filter((r) => !r.passed && r.severity === 'info')
      .length,
  };
}
