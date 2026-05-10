import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  loadConfig,
  runAudit,
  calculateScore,
  buildRecommendations,
  summarizeConfigAuditLayer,
  formatJsonReport,
  formatCliReport,
  getRulesForVertical,
  SCORECARD_VERSION,
} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');
const _require = createRequire(import.meta.url);
const pkg = _require('../package.json') as { version: string };

describe('Library entrypoint', () => {
  it('exports a working pipeline that produces a valid report', () => {
    const config = loadConfig(resolve(fixturesDir, 'good-agent.json'));
    const results = runAudit(config, 'sled-grant');
    const score = calculateScore(results);
    const layer = summarizeConfigAuditLayer(results);
    const recs = buildRecommendations(results);

    expect(score.grade).toBe('A');
    expect(
      layer.passed + layer.failed + layer.warnings + layer.infoIssues,
    ).toBe(layer.totalChecks);
    expect(recs.length).toBeGreaterThanOrEqual(0);
  });

  it('exports getRulesForVertical and SCORECARD_VERSION', () => {
    expect(getRulesForVertical()).toHaveLength(24);
    expect(getRulesForVertical('sled-grant')).toHaveLength(28);
    expect(SCORECARD_VERSION).toBe(pkg.version);
  });

  it('exports formatJsonReport and formatCliReport', () => {
    const config = loadConfig(resolve(fixturesDir, 'edge-case-agent.json'));
    const results = runAudit(config);
    const score = calculateScore(results);
    const layer = summarizeConfigAuditLayer(results);
    const report = {
      metadata: {
        agentId: config.agentId,
        agentName: config.agentName,
        timestamp: '2026-05-08T00:00:00Z',
        scorecardVersion: SCORECARD_VERSION,
        phasesRun: ['config-audit'] as string[],
      },
      overallScore: score.score,
      overallGrade: score.grade,
      deploymentRecommendation: score.deploymentRecommendation,
      layers: {
        configAudit: {
          score: score.score,
          totalChecks: layer.totalChecks,
          passed: layer.passed,
          failed: layer.failed,
          warnings: layer.warnings,
          infoIssues: layer.infoIssues,
          results,
        },
      },
      recommendations: buildRecommendations(results),
    };

    const json = formatJsonReport(report);
    expect(JSON.parse(json).overallGrade).toBeDefined();

    const cli = formatCliReport(report);
    expect(cli).toContain(config.agentName);
  });
});
