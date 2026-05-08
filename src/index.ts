// Library entrypoint — exposes the stable audit pipeline for programmatic use.

export { loadConfig, ConfigLoadError } from './config/loader.js';
export { SCORECARD_VERSION } from './config/constants.js';
export { runAudit, getRulesForVertical } from './auditors/runner.js';
export { calculateScore, buildRecommendations } from './scoring/aggregator.js';
export { summarizeConfigAuditLayer } from './report/config-audit-summary.js';
export { formatJsonReport } from './output/json-reporter.js';
export { formatCliReport } from './output/cli-reporter.js';

export type {
  AgentConfig,
  AuditRule,
  AuditResult,
  Severity,
  Grade,
  DeploymentRecommendation,
  ScorecardScore,
  ScorecardReport,
  Recommendation,
} from './config/types.js';
