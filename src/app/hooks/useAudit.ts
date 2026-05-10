import { useState, useEffect } from 'react';
import type { AgentConfig, ScorecardReport } from '../../config/types.js';
import { runAudit } from '../../auditors/runner.js';
import { runSimulation } from '../../simulation/simulator.js';
import {
  calculateScore,
  calculateOverallScore,
  buildRecommendations,
} from '../../scoring/aggregator.js';
import { summarizeConfigAuditLayer } from '../../report/config-audit-summary.js';
import { SCORECARD_VERSION } from '../../config/constants.js';

export interface UseAuditResult {
  report: ScorecardReport | null;
  loading: boolean;
}

export function useAudit(config: AgentConfig | null): UseAuditResult {
  const [report, setReport] = useState<ScorecardReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config) {
      setReport(null);
      return;
    }

    setLoading(true);

    const results = runAudit(config);
    const simSummary = runSimulation(config);
    const layer = summarizeConfigAuditLayer(results);
    const score = calculateOverallScore({
      configAuditResults: results,
      simulationSummary: simSummary,
    });

    const newReport: ScorecardReport = {
      metadata: {
        agentId: config.agentId,
        agentName: config.agentName,
        timestamp: new Date().toISOString(),
        scorecardVersion: SCORECARD_VERSION,
        phasesRun: ['config-audit', 'simulation'],
      },
      overallScore: score.score,
      overallGrade: score.grade,
      deploymentRecommendation: score.deploymentRecommendation,
      layers: {
        configAudit: {
          score: calculateScore(results).score,
          totalChecks: layer.totalChecks,
          passed: layer.passed,
          failed: layer.failed,
          warnings: layer.warnings,
          infoIssues: layer.infoIssues,
          results,
        },
        simulation: {
          overallResilience: simSummary.overallResilience,
          probeCount: simSummary.probeCount,
          resilient: simSummary.resilient,
          partial: simSummary.partial,
          vulnerable: simSummary.vulnerable,
          results: simSummary.results,
        },
      },
      recommendations: buildRecommendations(results),
    };

    setReport(newReport);
    setLoading(false);
  }, [config]);

  return { report, loading };
}
