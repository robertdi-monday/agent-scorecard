#!/usr/bin/env node

import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { loadConfig, ConfigLoadError } from './config/loader.js';
import { SCORECARD_VERSION } from './config/constants.js';
import { runAudit } from './auditors/runner.js';
import {
  calculateScore,
  calculateOverallScore,
  calculatePillarScores,
  deriveScoringWeights,
  buildAllRecommendations,
} from './scoring/aggregator.js';
import { inferAutonomyTier, tierAwareReady } from './scoring/autonomy-tier.js';
import type { MultiLayerInput } from './scoring/aggregator.js';
import { runSimulation } from './simulation/simulator.js';
import { formatJsonReport } from './output/json-reporter.js';
import { formatCliReport } from './output/cli-reporter.js';
import { summarizeConfigAuditLayer } from './report/config-audit-summary.js';
import type { AuditContext, ScorecardReport } from './config/types.js';

const program = new Command();

program
  .name('agent-scorecard')
  .description(
    'Deterministic configuration audit for monday.com Agent Builder agents',
  )
  .version(SCORECARD_VERSION);

program
  .command('audit')
  .description('Run a configuration audit against an agent config JSON file')
  .requiredOption('--config <path>', 'Path to agent config JSON file')
  .option('--vertical <name>', 'Vertical rule pack (e.g., "sled-grant")')
  .option(
    '--parent-config <path>',
    'Path to parent agent config for PM-002 inheritance check',
  )
  .option(
    '--simulate',
    'Run adversarial simulation probes in addition to config audit',
  )
  .option('--llm-review', 'Run LLM-in-the-loop semantic review')
  .option(
    '--llm-api-key <key>',
    'Anthropic API key (or set ANTHROPIC_API_KEY env var)',
  )
  .option(
    '--llm-model <model>',
    'LLM model to use (default: claude-haiku-4-5-20251001)',
  )
  .option('--format <type>', 'Output format: "cli" (default) or "json"', 'cli')
  .option('--output <path>', 'Write JSON output to file instead of stdout')
  .action(
    async (options: {
      config: string;
      vertical?: string;
      parentConfig?: string;
      simulate?: boolean;
      llmReview?: boolean;
      llmApiKey?: string;
      llmModel?: string;
      format: string;
      output?: string;
    }) => {
      try {
        const config = loadConfig(options.config);

        const context: AuditContext = {};
        if (options.parentConfig) {
          context.parentConfig = loadConfig(options.parentConfig);
        }
        const results = runAudit(config, options.vertical, context);

        const layer = summarizeConfigAuditLayer(results);
        const phasesRun: string[] = ['config-audit'];

        const multiLayerInput: MultiLayerInput = {
          configAuditResults: results,
        };

        let simulationLayer: ScorecardReport['layers']['simulation'];
        let llmReviewLayer: ScorecardReport['layers']['llmReview'];

        if (options.simulate) {
          const simSummary = runSimulation(config);
          multiLayerInput.simulationSummary = simSummary;
          simulationLayer = {
            overallResilience: simSummary.overallResilience,
            probeCount: simSummary.probeCount,
            resilient: simSummary.resilient,
            partial: simSummary.partial,
            vulnerable: simSummary.vulnerable,
            results: simSummary.results,
          };
          phasesRun.push('simulation');
        }

        if (options.llmReview) {
          const apiKey =
            options.llmApiKey || process.env.ANTHROPIC_API_KEY || '';
          if (!apiKey) {
            console.error(
              'Error: --llm-review requires --llm-api-key or ANTHROPIC_API_KEY env var.',
            );
            process.exitCode = 2;
            return;
          }

          const { createAnthropicClient } =
            await import('./llm-review/llm-client.js');
          const { runLlmReview } = await import('./llm-review/reviewer.js');

          const client = createAnthropicClient(apiKey);
          if (options.llmModel) {
            const origComplete = client.complete.bind(client);
            client.complete = (prompt, opts) =>
              origComplete(prompt, { ...opts, model: options.llmModel });
          }

          const failedRules = results.filter((r) => !r.passed);
          const simulationGaps =
            multiLayerInput.simulationSummary?.results
              .filter((r) => r.verdict !== 'resilient')
              .flatMap((r) => r.gaps) ?? [];

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
        }

        const score =
          multiLayerInput.simulationSummary || multiLayerInput.llmReviewSummary
            ? calculateOverallScore(multiLayerInput)
            : calculateScore(results);

        const weights = deriveScoringWeights(multiLayerInput);

        const pillarScores = calculatePillarScores(
          results,
          multiLayerInput.llmReviewSummary,
        );

        const tierInference = inferAutonomyTier(config);
        const tierGate = tierAwareReady(
          tierInference.tier,
          score.score,
          score.grade,
        );
        // GOV-001 modifier: a high-autonomy agent may pass raw thresholds but
        // still be downgraded to needs-fixes if it doesn't clear the tier bar.
        const finalRecommendation =
          score.deploymentRecommendation === 'ready' && !tierGate.ready
            ? 'needs-fixes'
            : score.deploymentRecommendation;

        const report: ScorecardReport = {
          metadata: {
            agentId: config.agentId,
            agentName: config.agentName,
            vertical: options.vertical,
            timestamp: new Date().toISOString(),
            scorecardVersion: SCORECARD_VERSION,
            phasesRun,
            scoringWeights: { ...weights },
            autonomyTier: tierInference.tier,
            autonomyTierRationale: tierInference.rationale,
          },
          overallScore: score.score,
          overallGrade: score.grade,
          pillarScores,
          deploymentRecommendation: finalRecommendation,
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
            ...(simulationLayer ? { simulation: simulationLayer } : {}),
            ...(llmReviewLayer ? { llmReview: llmReviewLayer } : {}),
          },
          recommendations: buildAllRecommendations(
            results,
            multiLayerInput.llmReviewSummary,
          ),
        };

        if (options.format === 'json') {
          const json = formatJsonReport(report);
          if (options.output) {
            writeFileSync(options.output, json, 'utf-8');
            console.log(`Report written to ${options.output}`);
          } else {
            console.log(json);
          }
        } else {
          console.log(formatCliReport(report));
        }

        if (finalRecommendation === 'not-ready') {
          process.exitCode = 1;
        }
      } catch (err) {
        if (err instanceof ConfigLoadError) {
          console.error(`Error: ${err.message}`);
          process.exitCode = 2;
        } else {
          throw err;
        }
      }
    },
  );

program.parse();
