/**
 * QA validation suite — complements granular unit tests with cross-cutting
 * contracts, boundaries, and report invariants called out in external review.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigLoadError } from '../src/config/loader.js';
import { runAudit, getRulesForVertical } from '../src/auditors/runner.js';
import {
  calculateScore,
  buildRecommendations,
} from '../src/scoring/aggregator.js';
import { summarizeConfigAuditLayer } from '../src/report/config-audit-summary.js';
import { formatJsonReport } from '../src/output/json-reporter.js';
import { knowledgeBaseRules } from '../src/auditors/knowledge-base-auditor.js';
import { triggerRules } from '../src/auditors/trigger-auditor.js';
import { instructionRules } from '../src/auditors/instruction-auditor.js';
import { SCORECARD_VERSION } from '../src/config/constants.js';
import type {
  AgentConfig,
  AuditResult,
  ScorecardReport,
} from '../src/config/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

const [, kb002] = knowledgeBaseRules;
const [tr001, tr002] = triggerRules;
const [in001] = instructionRules;

function minimalValidObject() {
  return {
    agentId: 'id-1',
    agentName: 'Agent',
    kind: 'PERSONAL',
    state: 'ACTIVE',
    instructions: { goal: 'goal text here', plan: 'plan text here' },
    knowledgeBase: { files: [] },
    tools: [] as unknown[],
    triggers: [],
    permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
  };
}

let loaderTmp = '';
afterEach(() => {
  vi.restoreAllMocks();
  if (loaderTmp) {
    rmSync(loaderTmp, { recursive: true, force: true });
    loaderTmp = '';
  }
});

function writeTempConfig(obj: unknown): string {
  loaderTmp = mkdtempSync(join(tmpdir(), 'qa-loader-'));
  const p = join(loaderTmp, 'cfg.json');
  writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}

function makeInfoResults(passedCount: number, total: number): AuditResult[] {
  return Array.from({ length: total }, (_, i) => ({
    ruleId: `R-${String(i).padStart(4, '0')}`,
    ruleName: 't',
    severity: 'info' as const,
    passed: i < passedCount,
    message: 'm',
  }));
}

function buildReport(
  fixtureName: string,
  vertical?: string,
): { results: AuditResult[]; report: ScorecardReport } {
  const configPath = resolve(fixturesDir, fixtureName);
  const config = loadConfig(configPath);
  const results = runAudit(config, vertical);
  const score = calculateScore(results);
  const layer = summarizeConfigAuditLayer(results);
  const report: ScorecardReport = {
    metadata: {
      agentId: config.agentId,
      agentName: config.agentName,
      vertical,
      timestamp: '2026-05-08T12:00:00Z',
      scorecardVersion: SCORECARD_VERSION,
      phasesRun: ['config-audit'],
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
  return { results, report };
}

describe('QA — Loader robustness', () => {
  it('rejects empty object', () => {
    const p = writeTempConfig({});
    expect(() => loadConfig(p)).toThrow(ConfigLoadError);
  });

  it('rejects tool entry missing name', () => {
    const o = minimalValidObject();
    o.tools = [{ enabled: true }];
    expect(() => loadConfig(writeTempConfig(o))).toThrow(/tools\[0\]\.name/);
  });

  it('rejects tool entry with non-boolean enabled', () => {
    const o = minimalValidObject();
    o.tools = [{ name: 'x', enabled: 'yes' }];
    expect(() => loadConfig(writeTempConfig(o))).toThrow(
      /enabled must be a boolean/,
    );
  });

  it('rejects knowledgeBase.files entry missing fileName', () => {
    const o = minimalValidObject();
    o.knowledgeBase = { files: [{ sourceType: 'file' }] };
    expect(() => loadConfig(writeTempConfig(o))).toThrow(/fileName/);
  });

  it('rejects knowledgeBase.files entry that is not an object', () => {
    const o = minimalValidObject();
    o.knowledgeBase = { files: [null] };
    expect(() => loadConfig(writeTempConfig(o))).toThrow(/files\[0\]/);
  });

  it('allows extra top-level fields (passthrough)', () => {
    const o = minimalValidObject() as Record<string, unknown>;
    o.exportedAt = '2026-01-01';
    const cfg = loadConfig(writeTempConfig(o));
    expect(cfg.agentId).toBe('id-1');
  });
});

describe('QA — Scoring boundaries & rounding', () => {
  it('exact band scores: 90→A, 75→B, 60→C, 40→D, 0→F', () => {
    expect(calculateScore(makeInfoResults(90, 100)).score).toBe(90);
    expect(calculateScore(makeInfoResults(90, 100)).grade).toBe('A');
    expect(calculateScore(makeInfoResults(75, 100)).grade).toBe('B');
    expect(calculateScore(makeInfoResults(60, 100)).grade).toBe('C');
    expect(calculateScore(makeInfoResults(40, 100)).grade).toBe('D');
    expect(calculateScore(makeInfoResults(0, 100)).grade).toBe('F');
  });

  it('rounds 89.95 raw score to 90.0 → Grade A', () => {
    const s = calculateScore(makeInfoResults(1799, 2000));
    expect(s.score).toBe(90);
    expect(s.grade).toBe('A');
  });

  it('hard-fail caps B→C but does not promote D or F', () => {
    const high = [
      ...makeInfoResults(99, 100),
      {
        ruleId: 'C-001',
        ruleName: 'x',
        severity: 'critical' as const,
        passed: false,
        message: 'm',
      },
    ];
    expect(calculateScore(high).grade).toBe('C');

    const lowD = [
      ...makeInfoResults(50, 100),
      {
        ruleId: 'C-001',
        ruleName: 'x',
        severity: 'critical' as const,
        passed: false,
        message: 'm',
      },
    ];
    expect(calculateScore(lowD).grade).toBe('D');

    const lowF = [
      ...makeInfoResults(10, 100),
      {
        ruleId: 'C-001',
        ruleName: 'x',
        severity: 'critical' as const,
        passed: false,
        message: 'm',
      },
    ];
    expect(calculateScore(lowF).grade).toBe('F');
  });

  it('deployment recommendation matches grade bands', () => {
    expect(
      calculateScore(makeInfoResults(100, 100)).deploymentRecommendation,
    ).toBe('ready');
    expect(
      calculateScore(makeInfoResults(80, 100)).deploymentRecommendation,
    ).toBe('needs-fixes');
    expect(
      calculateScore(makeInfoResults(65, 100)).deploymentRecommendation,
    ).toBe('needs-fixes');
    expect(
      calculateScore(makeInfoResults(50, 100)).deploymentRecommendation,
    ).toBe('not-ready');
    expect(
      calculateScore(makeInfoResults(10, 100)).deploymentRecommendation,
    ).toBe('not-ready');
  });
});

describe('QA — Rule metadata (17 rules with sled-grant)', () => {
  const agent = (): AgentConfig => ({
    agentId: 'qa',
    agentName: 'QA',
    kind: 'PERSONAL',
    state: 'ACTIVE',
    instructions: {
      goal: 'x'.repeat(120),
      plan: 'y'.repeat(120),
      userPrompt: '',
    },
    knowledgeBase: { files: [] },
    tools: [],
    triggers: [],
    permissions: {
      scopeType: 'board',
      connectedBoards: [],
      connectedDocs: [],
    },
    skills: [],
  });

  it('each rule returns stable id, name, severity', () => {
    const cfg = agent();
    for (const rule of getRulesForVertical('sled-grant')) {
      const r = rule.check(cfg);
      expect(r.ruleId).toBe(rule.id);
      expect(r.ruleName).toBe(rule.name);
      expect(r.severity).toBe(rule.severity);
    }
  });

  it('passing results omit recommendation; failing include non-empty how-to-fix path', () => {
    const { results } = buildReport('good-agent.json', 'sled-grant');
    for (const r of results) {
      if (r.passed) expect(r.recommendation).toBeUndefined();
      else expect(r.recommendation?.length).toBeGreaterThan(0);
    }
  });

  it('PM-001 carries OWASP ASI-03 when failed on bad fixture', () => {
    const { results } = buildReport('bad-agent.json', 'sled-grant');
    const pm = results.find((x) => x.ruleId === 'PM-001');
    expect(pm?.passed).toBe(false);
    expect(pm?.owaspAsi).toContain('ASI-03');
  });
});

describe('QA — Auditor edge cases', () => {
  it('KB-002: goal with only short tokens yields empty goalWords and fails relevance', () => {
    const cfg: AgentConfig = {
      agentId: 'a',
      agentName: 'b',
      kind: 'PERSONAL',
      state: 'ACTIVE',
      instructions: {
        goal: 'aa bb cc',
        plan: 'plan text here extra chars',
        userPrompt: '',
      },
      knowledgeBase: {
        files: [{ fileName: 'unrelated.pdf', sourceType: 'file' }],
      },
      tools: [],
      triggers: [],
      permissions: {
        scopeType: 'board',
        connectedBoards: [],
        connectedDocs: [],
      },
      skills: [],
    };
    const r = kb002.check(cfg);
    expect(r.passed).toBe(false);
  });

  it('TR-001: column match is case-insensitive', () => {
    const cfg: AgentConfig = {
      agentId: 'a',
      agentName: 'b',
      kind: 'PERSONAL',
      state: 'ACTIVE',
      instructions: { goal: 'g', plan: 'p' },
      knowledgeBase: { files: [{ fileName: 'f.pdf', sourceType: 'file' }] },
      tools: [
        {
          name: 'writer',
          displayName: 'W',
          type: 'custom',
          connectionStatus: 'connected',
          enabled: true,
          modifiesColumns: ['Status'],
        },
      ],
      triggers: [
        {
          name: 't',
          blockReferenceId: 'b',
          triggerType: 'column_change',
          triggerConfig: { columnId: 'status' },
        },
      ],
      permissions: {
        scopeType: 'board',
        connectedBoards: [],
        connectedDocs: [],
      },
      skills: [],
    };
    const r = tr001.check(cfg);
    expect(r.passed).toBe(false);
  });

  it('TR-001: non-string columnId does not false-positive overlap', () => {
    const cfg: AgentConfig = {
      agentId: 'a',
      agentName: 'b',
      kind: 'PERSONAL',
      state: 'ACTIVE',
      instructions: { goal: 'g', plan: 'p' },
      knowledgeBase: { files: [{ fileName: 'f.pdf', sourceType: 'file' }] },
      tools: [
        {
          name: 'writer',
          displayName: 'W',
          type: 'custom',
          connectionStatus: 'connected',
          enabled: true,
          modifiesColumns: ['col1'],
        },
      ],
      triggers: [
        {
          name: 't',
          blockReferenceId: 'b',
          triggerType: 'column_change',
          triggerConfig: { columnId: 123 },
        },
      ],
      permissions: {
        scopeType: 'board',
        connectedBoards: [],
        connectedDocs: [],
      },
      skills: [],
    };
    expect(tr001.check(cfg).passed).toBe(true);
  });

  it('IN-001: combined instruction length uses single spaces between non-empty parts', () => {
    const cfg: AgentConfig = {
      agentId: 'a',
      agentName: 'b',
      kind: 'PERSONAL',
      state: 'ACTIVE',
      instructions: {
        goal: 'a'.repeat(50),
        plan: 'b'.repeat(50),
        userPrompt: '',
      },
      knowledgeBase: { files: [{ fileName: 'f.pdf', sourceType: 'file' }] },
      tools: [],
      triggers: [],
      permissions: {
        scopeType: 'board',
        connectedBoards: [],
        connectedDocs: [],
      },
      skills: [],
    };
    const r = in001.check(cfg);
    expect(r.evidence?.length).toBe(101);
    expect(r.passed).toBe(true);
  });

  it('TR-002: trigger name with only short words is treated as misaligned', () => {
    const cfg: AgentConfig = {
      agentId: 'a',
      agentName: 'b',
      kind: 'PERSONAL',
      state: 'ACTIVE',
      instructions: {
        goal: 'Handle invoices and procurement workflows',
        plan: 'p',
        userPrompt: '',
      },
      knowledgeBase: { files: [{ fileName: 'f.pdf', sourceType: 'file' }] },
      tools: [],
      triggers: [
        {
          name: 'x y z',
          blockReferenceId: 'b',
          triggerType: 'item_created',
          triggerConfig: {},
        },
      ],
      permissions: {
        scopeType: 'board',
        connectedBoards: [],
        connectedDocs: [],
      },
      skills: [],
    };
    const r = tr002.check(cfg);
    expect(r.passed).toBe(false);
  });
});

describe('QA — Report structure invariants', () => {
  const requiredJsonKeys = [
    'metadata',
    'overallScore',
    'overallGrade',
    'deploymentRecommendation',
    'layers',
    'recommendations',
  ];

  it.each([
    ['good-agent.json', 'sled-grant'],
    ['bad-agent.json', 'sled-grant'],
    ['edge-case-agent.json', undefined],
  ] as const)('JSON report shape for %s', (fixture, vertical) => {
    const { report } = buildReport(fixture, vertical);
    const json = JSON.parse(formatJsonReport(report));
    for (const k of requiredJsonKeys) {
      expect(json).toHaveProperty(k);
    }
    const layer = json.layers.configAudit;
    expect(
      layer.passed + layer.failed + layer.warnings + layer.infoIssues,
    ).toBe(layer.totalChecks);
    expect(json.overallScore).toBe(layer.score);
    expect(layer.results.length).toBe(layer.totalChecks);
  });

  it('recommendations stay sorted by priority then rule id', () => {
    const { report } = buildReport('bad-agent.json', 'sled-grant');
    const pri = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < report.recommendations.length; i++) {
      const a = report.recommendations[i - 1];
      const b = report.recommendations[i];
      const cmp = pri[a.priority] - pri[b.priority];
      expect(
        cmp < 0 || (cmp === 0 && a.relatedCheckIds[0] <= b.relatedCheckIds[0]),
      ).toBe(true);
    }
  });
});

describe('QA — Runner routing', () => {
  it('empty string vertical uses base rules only', () => {
    expect(getRulesForVertical('').map((r) => r.id)).toHaveLength(13);
  });

  it('rule order is deterministic across calls', () => {
    const a = getRulesForVertical('sled-grant').map((r) => r.id);
    const b = getRulesForVertical('sled-grant').map((r) => r.id);
    expect(a).toEqual(b);
  });
});

describe('QA — Recommendation builder', () => {
  it('maps severities to priorities and excludes passing rows', () => {
    const results: AuditResult[] = [
      {
        ruleId: 'A-001',
        ruleName: 'n',
        severity: 'critical',
        passed: false,
        message: 'm',
        recommendation: 'fix',
      },
      {
        ruleId: 'B-001',
        ruleName: 'n',
        severity: 'warning',
        passed: false,
        message: 'm',
        recommendation: 'fix',
      },
      {
        ruleId: 'C-001',
        ruleName: 'n',
        severity: 'info',
        passed: false,
        message: 'm',
        recommendation: 'fix',
      },
      {
        ruleId: 'D-001',
        ruleName: 'n',
        severity: 'warning',
        passed: true,
        message: 'ok',
        recommendation: 'should not appear',
      },
    ];
    const recs = buildRecommendations(results);
    expect(recs).toHaveLength(3);
    expect(recs.map((r) => r.priority)).toEqual(['critical', 'high', 'medium']);
    expect(recs.some((r) => r.relatedCheckIds[0] === 'D-001')).toBe(false);
  });

  it('stable sort when same priority', () => {
    const results: AuditResult[] = [
      {
        ruleId: 'Z-001',
        ruleName: 'n',
        severity: 'warning',
        passed: false,
        message: 'm',
        recommendation: 'f',
      },
      {
        ruleId: 'A-001',
        ruleName: 'n',
        severity: 'warning',
        passed: false,
        message: 'm',
        recommendation: 'f',
      },
    ];
    const recs = buildRecommendations(results);
    expect(recs.map((r) => r.relatedCheckIds[0])).toEqual(['A-001', 'Z-001']);
  });
});
