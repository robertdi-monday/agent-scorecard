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

export interface AuditContext {
  parentConfig?: AgentConfig;
}

export interface AuditRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  category: string;
  vertical?: string;
  owaspAsi?: string[];
  check: (config: AgentConfig, context?: AuditContext) => AuditResult;
}

export interface AuditResult {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  passed: boolean;
  message: string;
  recommendation?: string;
  evidence?: Record<string, unknown>;
  owaspAsi?: string[];
}

// ── Scoring types ────────────────────────────────────────────────────────────

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

export interface ScorecardReport {
  metadata: {
    agentId: string;
    agentName: string;
    vertical?: string;
    timestamp: string;
    scorecardVersion: string;
    phasesRun: string[];
  };
  overallScore: number;
  overallGrade: Grade;
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
  owaspAsi?: string[];
}
