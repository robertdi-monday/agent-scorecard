import { useState, useEffect, useCallback } from 'react';
import type { AgentConfig, ScorecardReport } from '../../config/types.js';
import { runAudit } from '../../auditors/runner.js';
import { runSimulation } from '../../simulation/simulator.js';
import {
  calculateScore,
  calculateOverallScore,
  deriveScoringWeights,
  buildAllRecommendations,
} from '../../scoring/aggregator.js';
import type { MultiLayerInput } from '../../scoring/aggregator.js';
import { summarizeConfigAuditLayer } from '../../report/config-audit-summary.js';
import { SCORECARD_VERSION } from '../../config/constants.js';

export interface UseAuditResult {
  report: ScorecardReport | null;
  loading: boolean;
}

export function useAudit(
  config: AgentConfig | null,
  apiKey?: string,
): UseAuditResult {
  const [report, setReport] = useState<ScorecardReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runPipeline = useCallback(async () => {
    if (!config) {
      setReport(null);
      return;
    }

    setLoading(true);

    try {
      const results = runAudit(config);
      const simSummary = runSimulation(config);
      const layer = summarizeConfigAuditLayer(results);

      const multiLayerInput: MultiLayerInput = {
        configAuditResults: results,
        simulationSummary: simSummary,
      };

      const phasesRun: string[] = ['config-audit', 'simulation'];
      let llmReviewLayer: ScorecardReport['layers']['llmReview'];

      if (apiKey) {
        try {
          const { createAnthropicClient } =
            await import('../../llm-review/llm-client.js');
          const { runLlmReview } = await import('../../llm-review/reviewer.js');
          const client = createAnthropicClient(apiKey);
          const failedRules = results.filter((r) => !r.passed);
          const simulationGaps = simSummary.results
            .filter((r) => r.verdict !== 'resilient')
            .flatMap((r) => r.gaps);

          const llmSummary = await runLlmReview(
            config,
            client,
            failedRules,
            simulationGaps,
          );
          multiLayerInput.llmReviewSummary = llmSummary;
          llmReviewLayer = {
            overallScore: llmSummary.overallScore,
            checkCount: llmSummary.checkCount,
            passed: llmSummary.passed,
            failed: llmSummary.failed,
            results: llmSummary.results,
            tailoredFixes: llmSummary.tailoredFixes,
          };
          phasesRun.push('llm-review');
        } catch {
          // LLM review failure is non-blocking
        }
      }

      const score = calculateOverallScore(multiLayerInput);
      const weights = deriveScoringWeights(multiLayerInput);

      const newReport: ScorecardReport = {
        metadata: {
          agentId: config.agentId,
          agentName: config.agentName,
          timestamp: new Date().toISOString(),
          scorecardVersion: SCORECARD_VERSION,
          phasesRun,
          scoringWeights: { ...weights },
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
          ...(llmReviewLayer ? { llmReview: llmReviewLayer } : {}),
        },
        recommendations: buildAllRecommendations(
          results,
          multiLayerInput.llmReviewSummary,
        ),
      };

      setReport(newReport);
    } finally {
      setLoading(false);
    }
  }, [config, apiKey]);

  useEffect(() => {
    void runPipeline();
  }, [runPipeline]);

  return { report, loading };
}
