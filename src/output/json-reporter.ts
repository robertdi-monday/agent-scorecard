import type { ScorecardReport } from '../config/types.js';

/**
 * Serialize a ScorecardReport to formatted JSON.
 */
export function formatJsonReport(report: ScorecardReport): string {
  return JSON.stringify(report, null, 2);
}
