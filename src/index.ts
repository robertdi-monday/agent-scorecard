// Library entrypoint — exposes the stable audit pipeline for programmatic use.

export { loadConfig, ConfigLoadError } from './config/loader.js';
export { SCORECARD_VERSION } from './config/constants.js';
export { runAudit, getRulesForVertical } from './auditors/runner.js';
export {
  calculateScore,
  calculateOverallScore,
  deriveScoringWeights,
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
export { mapApiResponseToConfig } from './mapper/api-to-config.js';
export { runLlmReview } from './llm-review/reviewer.js';
export {
  createAnthropicClient,
  extractJson,
  completeJson,
} from './llm-review/llm-client.js';

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
  LlmReviewResultEntry,
  TailoredFixEntry,
} from './config/types.js';

export type {
  SimulationProbe,
  SimulationResult,
  SimulationSummary,
  SimulationCategory,
} from './simulation/types.js';

export type { MultiLayerInput, ScoringWeights } from './scoring/aggregator.js';
export type { InternalAgentResponse } from './mapper/api-types.js';
export type {
  LlmClient,
  LlmCallOptions,
  LlmReviewCheck,
  LlmReviewResult,
  LlmReviewSummary,
  TailoredFix,
} from './llm-review/types.js';
