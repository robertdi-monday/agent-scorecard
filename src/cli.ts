#!/usr/bin/env node

import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { loadConfig, ConfigLoadError } from './config/loader.js';
import { SCORECARD_VERSION } from './config/constants.js';
import { runAudit } from './auditors/runner.js';
import { calculateScore, buildRecommendations } from './scoring/aggregator.js';
import { formatJsonReport } from './output/json-reporter.js';
import { formatCliReport } from './output/cli-reporter.js';
import type { ScorecardReport } from './config/types.js';

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
  .option('--format <type>', 'Output format: "cli" (default) or "json"', 'cli')
  .option('--output <path>', 'Write JSON output to file instead of stdout')
  .action(
    (options: {
      config: string;
      vertical?: string;
      format: string;
      output?: string;
    }) => {
      try {
        // 1. Load config
        const config = loadConfig(options.config);

        // 2. Run audit
        const results = runAudit(config, options.vertical);

        // 3. Score
        const score = calculateScore(results);

        // 4. Build report
        const report: ScorecardReport = {
          metadata: {
            agentId: config.agentId,
            agentName: config.agentName,
            vertical: options.vertical,
            timestamp: new Date().toISOString(),
            scorecardVersion: SCORECARD_VERSION,
            phasesRun: ['config-audit'],
          },
          overallScore: score.score,
          overallGrade: score.grade,
          deploymentRecommendation: score.deploymentRecommendation,
          layers: {
            configAudit: {
              score: score.score,
              totalChecks: results.length,
              passed: results.filter((r) => r.passed).length,
              failed: results.filter(
                (r) => !r.passed && r.severity === 'critical',
              ).length,
              warnings: results.filter(
                (r) => !r.passed && r.severity !== 'critical',
              ).length,
              results,
            },
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
