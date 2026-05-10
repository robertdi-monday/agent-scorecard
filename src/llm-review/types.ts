import type { AgentConfig, AuditResult } from '../config/types.js';

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
  owaspAsi?: string[];
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

export interface TailoredRecommendationsInput {
  config: AgentConfig;
  client: LlmClient;
  phase1Results: LlmReviewResult[];
  failedRules: AuditResult[];
  simulationGaps: string[];
}
