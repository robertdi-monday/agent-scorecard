import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/loader.js';
import { runAudit } from '../src/auditors/runner.js';
import {
  calculateScore,
  buildRecommendations,
} from '../src/scoring/aggregator.js';
import { formatJsonReport } from '../src/output/json-reporter.js';
import { formatCliReport } from '../src/output/cli-reporter.js';
import { SCORECARD_VERSION } from '../src/config/constants.js';
import { summarizeConfigAuditLayer } from '../src/report/config-audit-summary.js';
import type { ScorecardReport } from '../src/config/types.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function runPipeline(fixtureName: string, vertical?: string) {
  const configPath = resolve(__dirname, 'fixtures', fixtureName);
  const config = loadConfig(configPath);
  const results = runAudit(config, vertical);
  const score = calculateScore(results);
  const layer = summarizeConfigAuditLayer(results);
  const report: ScorecardReport = {
    metadata: {
      agentId: config.agentId,
      agentName: config.agentName,
      vertical,
      timestamp: new Date().toISOString(),
      scorecardVersion: SCORECARD_VERSION,
      phasesRun: ['config-audit'],
      scoringWeights: { configAudit: 1.0 },
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
  return { config, results, score, report };
}

describe('Integration: Full pipeline', () => {
  describe('good-agent.json with sled-grant vertical', () => {
    it('scores Grade A', () => {
      const { score } = runPipeline('good-agent.json', 'sled-grant');
      expect(score.grade).toBe('A');
    });

    it('recommends deployment as ready', () => {
      const { score } = runPipeline('good-agent.json', 'sled-grant');
      expect(score.deploymentRecommendation).toBe('ready');
    });

    it('has no critical failures', () => {
      const { score } = runPipeline('good-agent.json', 'sled-grant');
      expect(score.hasCriticalFailure).toBe(false);
    });

    it('produces valid JSON output', () => {
      const { report } = runPipeline('good-agent.json', 'sled-grant');
      const json = formatJsonReport(report);
      const parsed = JSON.parse(json);
      expect(parsed.overallGrade).toBe('A');
    });

    it('produces CLI output without error', () => {
      const { report } = runPipeline('good-agent.json', 'sled-grant');
      const cli = formatCliReport(report);
      expect(cli).toContain('SLED Grant Management Assistant');
    });
  });

  describe('bad-agent.json with sled-grant vertical', () => {
    it('scores Grade F', () => {
      const { score } = runPipeline('bad-agent.json', 'sled-grant');
      expect(score.grade).toBe('F');
    });

    it('recommends not-ready', () => {
      const { score } = runPipeline('bad-agent.json', 'sled-grant');
      expect(score.deploymentRecommendation).toBe('not-ready');
    });

    it('has critical failures', () => {
      const { score } = runPipeline('bad-agent.json', 'sled-grant');
      expect(score.hasCriticalFailure).toBe(true);
    });

    it('produces multiple recommendations', () => {
      const { report } = runPipeline('bad-agent.json', 'sled-grant');
      expect(report.recommendations.length).toBeGreaterThan(3);
    });
  });

  describe('child-agent.json without vertical', () => {
    it('completes without error', () => {
      expect(() => runPipeline('child-agent.json')).not.toThrow();
    });

    it('PM-002 passes as info when no parent config provided', () => {
      const { results } = runPipeline('child-agent.json');
      const pm002 = results.find((r) => r.ruleId === 'PM-002');
      expect(pm002).toBeDefined();
      expect(pm002!.passed).toBe(true);
      expect(pm002!.severity).toBe('info');
    });

    it('runs only base rules (24)', () => {
      const { results } = runPipeline('child-agent.json');
      expect(results.length).toBe(24);
    });
  });

  describe('edge-case-agent.json without vertical', () => {
    it('completes without error', () => {
      expect(() => runPipeline('edge-case-agent.json')).not.toThrow();
    });

    it('runs only base rules (24)', () => {
      const { results } = runPipeline('edge-case-agent.json');
      expect(results.length).toBe(24);
    });

    it('produces a score between 0 and 100', () => {
      const { score } = runPipeline('edge-case-agent.json');
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
    });

    it('runs SLED rules when vertical is specified', () => {
      const { results } = runPipeline('edge-case-agent.json', 'sled-grant');
      expect(results.length).toBe(28);
    });
  });
});
