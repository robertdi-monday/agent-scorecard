// Library entrypoint — exposes the stable audit pipeline for programmatic use.

export { loadConfig, ConfigLoadError } from './config/loader.js';
export { SCORECARD_VERSION } from './config/constants.js';
export { runAudit, getRulesForVertical } from './auditors/runner.js';
export {
  calculateScore,
  calculateOverallScore,
  buildRecommendations,
  scoreToGrade,
  gradeRank,
  gradeToRecommendation,
} from './scoring/aggregator.js';
export { runSimulation } from './simulation/simulator.js';
export { summarizeConfigAuditLayer } from './report/config-audit-summary.js';
export { summarizeSimulationLayer } from './report/simulation-summary.js';
export { formatJsonReport } from './output/json-reporter.js';
export { formatCliReport } from './output/cli-reporter.js';
export {
  getInstructionText,
  findKeywords,
  jaccardSimilarity,
} from './helpers/text-analysis.js';

export type {
  AgentConfig,
  AuditContext,
  AuditRule,
  AuditResult,
  Severity,
  Grade,
  DeploymentRecommendation,
  ScorecardScore,
  ScorecardReport,
  Recommendation,
  SimulationResultEntry,
} from './config/types.js';

export type {
  SimulationProbe,
  SimulationResult,
  SimulationSummary,
  SimulationCategory,
} from './simulation/types.js';

export type { MultiLayerInput } from './scoring/aggregator.js';
