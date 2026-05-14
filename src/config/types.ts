// ── Input schema ──────────────────────────────────────────────────────────────

export interface AgentConfig {
  agentId: string;
  agentName: string;
  kind: 'PERSONAL' | 'ACCOUNT_LEVEL' | 'EXTERNAL';
  state: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DELETED' | 'FAILED';
  instructions: {
    goal: string;
    plan: string;
    userPrompt: string;
  };
  knowledgeBase: {
    files: Array<{
      fileName: string;
      sourceType: string;
      lastUpdated?: string; // ISO 8601
    }>;
  };
  tools: Array<{
    name: string;
    displayName: string;
    type: 'builtin' | 'custom' | 'app-feature' | 'mcp';
    connectionStatus: 'ready' | 'connected' | 'not_connected';
    enabled: boolean;
    modifiesColumns?: string[];
  }>;
  triggers: Array<{
    name: string;
    blockReferenceId: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
  }>;
  permissions: {
    scopeType: 'workspace' | 'board' | 'custom';
    connectedBoards: string[];
    connectedDocs: string[];
    parentAgentId?: string;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

// ── Rule & result types ──────────────────────────────────────────────────────

export type Severity = 'critical' | 'warning' | 'info';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type DeploymentRecommendation = 'ready' | 'needs-fixes' | 'not-ready';

/**
 * Quality pillars for v1 (instruction-only) rules. A rule with `pillar` set is
 * evaluable from text + enums alone and runs in the v1 (`get_agent`-fed) audit
 * surface; rules without `pillar` are full-mode-only (need tools / KB / perms).
 */
export type Pillar =
  | 'Completeness'
  | 'Safety'
  | 'Quality'
  | 'Observability'
  | 'Reliability';

export interface AuditContext {
  parentConfig?: AgentConfig;
}

export interface AuditRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  category: string;
  /** Set on v1-feasible (instruction-only) rules; absent on full-mode-only rules. */
  pillar?: Pillar;
  vertical?: string;
  /** Optional compact internal risk-tag codes for JSON exports — not shown in CLI tables or the embedded app UI. */
  owaspAsi?: string[];
  /**
   * Markdown snippet describing how the Scorecard Agent should perform this
   * check inside its own prompt. Composed by the agent-prompt builder so the
   * TS code path and the agent's `user_prompt` stay in lockstep.
   */
  agentPromptSnippet?: string;
  check: (config: AgentConfig, context?: AuditContext) => AuditResult;
}

export interface AuditResult {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  /** Populated by the runner from `rule.pillar` after each check. */
  pillar?: Pillar;
  passed: boolean;
  message: string;
  recommendation?: string;
  evidence?: Record<string, unknown>;
  /** Optional compact internal risk-tag codes for JSON exports — not shown in CLI tables or the embedded app UI. */
  owaspAsi?: string[];
}

// ── Scoring types ────────────────────────────────────────────────────────────

export interface PillarScore {
  pillar: string;
  score: number; // 0–100
  passed: number;
  failed: number;
  total: number;
}

export interface ScorecardScore {
  score: number; // 0–100
  grade: Grade;
  deploymentRecommendation: DeploymentRecommendation;
  hasCriticalFailure: boolean;
  totalWeight: number;
  passedWeight: number;
}

// ── Simulation result (inline — avoids circular import) ─────────────────────

export interface SimulationResultEntry {
  probeId: string;
  probeName: string;
  category: string;
  resilienceScore: number;
  verdict: 'resilient' | 'partial' | 'vulnerable';
  attackScenario: string;
  defenseFound: string[];
  gaps: string[];
  evidence: Record<string, unknown>;
}

// ── Report types ─────────────────────────────────────────────────────────────

// ── LLM review result (inline — avoids circular import) ─────────────────────

export interface LlmReviewResultEntry {
  checkId: string;
  checkName: string;
  severity: Severity;
  score: number;
  passed: boolean;
  message: string;
  recommendation?: string;
  rawResponse: Record<string, unknown>;
  evidence: Record<string, unknown>;
  /** Optional compact internal risk-tag codes for JSON exports — not shown in CLI tables or the embedded app UI. */
  owaspAsi?: string[];
  /**
   * Multi-judge confidence annotations (P2-F). Populated by the reviewer for
   * sampled LR checks (S-003, S-004, S-005, S-009). Single-judge checks leave
   * these undefined so reporters can render "—" instead of misleading zeroes.
   */
  samples?: number;
  variance?: number;
  lowConfidence?: boolean;
}

export interface TailoredFixEntry {
  relatedCheck: string;
  instructionText: string;
  placement: 'prepend' | 'append' | 'replace';
}

/**
 * GOV-001 autonomy tier — inferred from `kind` + capability surface in the
 * agent's plan text. Higher tiers face stricter grade thresholds.
 *
 *   1 = PERSONAL with narrow capability surface
 *   2 = PERSONAL with broad surface OR ACCOUNT_LEVEL with narrow surface
 *   3 = ACCOUNT_LEVEL with moderate surface
 *   4 = ACCOUNT_LEVEL with broad surface OR EXTERNAL (any)
 */
export type AutonomyTier = 1 | 2 | 3 | 4;

export interface ScorecardReport {
  metadata: {
    agentId: string;
    agentName: string;
    vertical?: string;
    timestamp: string;
    scorecardVersion: string;
    phasesRun: string[];
    scoringWeights: Record<string, number>;
    autonomyTier?: AutonomyTier;
    /** Rationale text for the tier inference (surfaced in reports). */
    autonomyTierRationale?: string;
  };
  overallScore: number;
  overallGrade: Grade;
  pillarScores?: PillarScore[];
  deploymentRecommendation: DeploymentRecommendation;
  layers: {
    configAudit: {
      score: number;
      totalChecks: number;
      passed: number;
      failed: number;
      /** Failed checks with severity `warning` only. */
      warnings: number;
      /** Failed checks with severity `info` only. */
      infoIssues: number;
      results: AuditResult[];
    };
    simulation?: {
      overallResilience: number;
      probeCount: number;
      resilient: number;
      partial: number;
      vulnerable: number;
      results: SimulationResultEntry[];
    };
    llmReview?: {
      overallScore: number;
      checkCount: number;
      passed: number;
      failed: number;
      results: LlmReviewResultEntry[];
      tailoredFixes?: TailoredFixEntry[];
    };
  };
  recommendations: Recommendation[];
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  howToFix: string;
  relatedCheckIds: string[];
  /** Optional compact internal risk-tag codes for JSON exports — not shown in CLI tables or the embedded app UI. */
  owaspAsi?: string[];
}
