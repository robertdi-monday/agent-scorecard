import type { AgentConfig } from '../config/types.js';

export interface LlmClient {
  complete(prompt: string, options?: LlmCallOptions): Promise<string>;
}

export interface LlmCallOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface LlmReviewCheck {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  /** Pillar tag — matches AuditRule.pillar so the prompt builder can group LR checks alongside deterministic ones. */
  pillar?:
    | 'Completeness'
    | 'Safety'
    | 'Quality'
    | 'Observability'
    | 'Reliability';
  owaspAsi?: string[];
  /** Same role as AuditRule.agentPromptSnippet — feeds the Scorecard Agent's user_prompt builder. */
  agentPromptSnippet?: string;
  run: (config: AgentConfig, client: LlmClient) => Promise<LlmReviewResult>;
}

export interface LlmReviewResult {
  checkId: string;
  checkName: string;
  severity: 'critical' | 'warning' | 'info';
  score: number;
  passed: boolean;
  message: string;
  recommendation?: string;
  rawResponse: Record<string, unknown>;
  evidence: Record<string, unknown>;
  owaspAsi?: string[];
  /**
   * Number of LLM judgments aggregated for this result. 1 means single-judge
   * (descriptive checks like Q-002, Q-003, C-007). >1 means multi-judge
   * sampling (S-003, S-004, S-005, S-009) — see `completeJsonSampled`.
   */
  samples?: number;
  /**
   * Sample variance of the multi-judge scores. Only meaningful when samples > 1.
   * Together with `lowConfidence` lets the CLI/JSON consumer flag shaky
   * judgments without re-deriving the threshold themselves.
   */
  variance?: number;
  /**
   * True when `samples > 1` AND `variance >= LOW_CONFIDENCE_VARIANCE_THRESHOLD`
   * (currently 200, ~stddev 14 on a 0–100 score). Indicates the judges
   * disagreed enough that the median is not stable — surface to the user as
   * "investigate by hand".
   */
  lowConfidence?: boolean;
}

export interface LlmReviewSummary {
  overallScore: number;
  checkCount: number;
  passed: number;
  failed: number;
  results: LlmReviewResult[];
  tailoredFixes?: TailoredFix[];
}

export interface TailoredFix {
  relatedCheck: string;
  instructionText: string;
  placement: 'prepend' | 'append' | 'replace';
}
