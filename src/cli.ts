#!/usr/bin/env node

import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { loadConfig, ConfigLoadError } from './config/loader.js';
import { SCORECARD_VERSION } from './config/constants.js';
import { runAudit } from './auditors/runner.js';
import {
  calculateScore,
  calculateOverallScore,
  buildRecommendations,
} from './scoring/aggregator.js';
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
  .option('--format <type>', 'Output format: "cli" (default) or "json"', 'cli')
  .option('--output <path>', 'Write JSON output to file instead of stdout')
  .action(
    (options: {
      config: string;
      vertical?: string;
      parentConfig?: string;
      simulate?: boolean;
      format: string;
      output?: string;
    }) => {
      try {
        // 1. Load config
        const config = loadConfig(options.config);

        // 2. Run audit
        const context: AuditContext = {};
        if (options.parentConfig) {
          context.parentConfig = loadConfig(options.parentConfig);
        }
        const results = runAudit(config, options.vertical, context);

        // 3. Score
        const layer = summarizeConfigAuditLayer(results);
        const phasesRun: string[] = ['config-audit'];

        let score;
        let simulationLayer: ScorecardReport['layers']['simulation'];

        if (options.simulate) {
          const simSummary = runSimulation(config);
          score = calculateOverallScore({
            configAuditResults: results,
            simulationSummary: simSummary,
          });
          simulationLayer = {
            overallResilience: simSummary.overallResilience,
            probeCount: simSummary.probeCount,
            resilient: simSummary.resilient,
            partial: simSummary.partial,
            vulnerable: simSummary.vulnerable,
            results: simSummary.results,
          };
          phasesRun.push('simulation');
        } else {
          score = calculateScore(results);
        }

        // 4. Build report
        const report: ScorecardReport = {
          metadata: {
            agentId: config.agentId,
            agentName: config.agentName,
            vertical: options.vertical,
            timestamp: new Date().toISOString(),
            scorecardVersion: SCORECARD_VERSION,
            phasesRun,
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
            ...(simulationLayer ? { simulation: simulationLayer } : {}),
          },
          recommendations: buildRecommendations(results),
        };

        // 5. Output
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

        // Exit with non-zero if not ready
        if (score.deploymentRecommendation === 'not-ready') {
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
