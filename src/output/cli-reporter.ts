import chalk from 'chalk';
import Table from 'cli-table3';
import type {
  ScorecardReport,
  AuditResult,
  Recommendation,
  SimulationResultEntry,
} from '../config/types.js';
import type { LlmReviewResult } from '../llm-review/types.js';

/**
 * Format a ScorecardReport as a colored CLI table output.
 */
export function formatCliReport(report: ScorecardReport): string {
  const sections: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  sections.push(formatHeader(report));

  // ── Config Audit Results ───────────────────────────────────────────────────
  sections.push(formatResultsTable(report.layers.configAudit.results));

  // ── Simulation Results ────────────────────────────────────────────────────
  if (report.layers.simulation) {
    sections.push(formatSimulationSection(report.layers.simulation));
  }

  // ── LLM Review Results ─────────────────────────────────────────────────────
  if (report.layers.llmReview) {
    sections.push(formatLlmReviewSection(report.layers.llmReview));
  }

  // ── Recommendations ────────────────────────────────────────────────────────
  if (report.recommendations.length > 0) {
    sections.push(formatRecommendations(report.recommendations));
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  sections.push(
    chalk.dim(
      `Scorecard v${report.metadata.scorecardVersion} · ${report.metadata.timestamp}`,
    ),
  );

  return sections.join('\n\n');
}

function formatHeader(report: ScorecardReport): string {
  const gradeColor = getGradeColor(report.overallGrade);
  const recColor = getRecommendationColor(report.deploymentRecommendation);

  const lines = [
    chalk.bold('╔══════════════════════════════════════════╗'),
    chalk.bold('║       Agent Quality Scorecard            ║'),
    chalk.bold('╚══════════════════════════════════════════╝'),
    '',
    `  Agent:          ${chalk.bold(report.metadata.agentName)}`,
    `  Agent ID:       ${report.metadata.agentId}`,
  ];

  if (report.metadata.vertical) {
    lines.push(`  Vertical:       ${report.metadata.vertical}`);
  }

  lines.push(
    '',
    `  Overall Score:  ${gradeColor(String(report.overallScore) + '/100')}`,
    `  Grade:          ${gradeColor(report.overallGrade)}`,
    `  Recommendation: ${recColor(report.deploymentRecommendation)}`,
  );

  if (report.layers.simulation) {
    const sim = report.layers.simulation;
    const resColor =
      sim.overallResilience >= 70
        ? chalk.green
        : sim.overallResilience >= 40
          ? chalk.yellow
          : chalk.red;
    lines.push(
      `  Resilience:     ${resColor(String(sim.overallResilience) + '/100')} (${sim.resilient} resilient · ${sim.partial} partial · ${sim.vulnerable} vulnerable)`,
    );
  }

  lines.push(
    '',
    `  Checks:         ${report.layers.configAudit.totalChecks} total · ${chalk.green(String(report.layers.configAudit.passed) + ' passed')} · ${chalk.red(String(report.layers.configAudit.failed) + ' failed')} · ${chalk.yellow(String(report.layers.configAudit.warnings) + ' warnings')} · ${chalk.blue(String(report.layers.configAudit.infoIssues) + ' info')}`,
  );

  return lines.join('\n');
}

function formatResultsTable(results: AuditResult[]): string {
  const table = new Table({
    head: [
      chalk.bold('Status'),
      chalk.bold('Rule'),
      chalk.bold('Severity'),
      chalk.bold('Message'),
    ],
    colWidths: [8, 24, 12, 60],
    wordWrap: true,
    style: { head: [], border: [] },
  });

  for (const result of results) {
    const icon = result.passed
      ? chalk.green('✅')
      : result.severity === 'critical'
        ? chalk.red('❌')
        : chalk.yellow('⚠️');

    const severityStr = formatSeverity(result.severity);
    const ruleName = `${result.ruleId}: ${result.ruleName}`;

    table.push([icon, ruleName, severityStr, result.message]);
  }

  return table.toString();
}

function formatSimulationSection(
  sim: NonNullable<ScorecardReport['layers']['simulation']>,
): string {
  const table = new Table({
    head: [
      chalk.bold('Probe'),
      chalk.bold('Score'),
      chalk.bold('Verdict'),
      chalk.bold('Attack Scenario'),
    ],
    colWidths: [28, 8, 14, 54],
    wordWrap: true,
    style: { head: [], border: [] },
  });

  for (const r of sim.results) {
    const verdictStr = formatVerdict(r.verdict);
    table.push([
      `${r.probeId}: ${r.probeName}`,
      String(r.resilienceScore),
      verdictStr,
      r.attackScenario,
    ]);
  }

  return chalk.bold.underline('Simulation Probes') + '\n\n' + table.toString();
}

function formatLlmReviewSection(
  llm: NonNullable<ScorecardReport['layers']['llmReview']>,
): string {
  const table = new Table({
    head: [
      chalk.bold('Status'),
      chalk.bold('LR Check'),
      chalk.bold('Score'),
      chalk.bold('Confidence'),
      chalk.bold('Message'),
    ],
    colWidths: [8, 32, 8, 14, 50],
    wordWrap: true,
    style: { head: [], border: [] },
  });

  for (const r of llm.results) {
    const icon = r.passed
      ? chalk.green('✅')
      : r.severity === 'critical'
        ? chalk.red('❌')
        : chalk.yellow('⚠️');

    const ruleName = `${r.checkId}: ${r.checkName}`;

    // Score = the LR check's median (or single-judge) numeric output.
    const scoreCol = formatLrScore(r.score);

    // Confidence column: blank for descriptive checks, "n=k σ²=v" for sampled.
    const confCol = formatConfidence(r);

    table.push([icon, ruleName, scoreCol, confCol, r.message]);
  }

  const header = chalk.bold.underline(
    `LLM Review (${llm.passed} passed · ${llm.failed} failed · overall ${llm.overallScore}/100)`,
  );

  const lowConfCount = llm.results.filter((r) => r.lowConfidence).length;
  const footer =
    lowConfCount > 0
      ? '\n\n' +
        chalk.yellow(
          `  ⚠ ${lowConfCount} low-confidence judgment${lowConfCount === 1 ? '' : 's'} — judges disagreed substantially. Review manually before relying on score.`,
        )
      : '';

  return header + '\n\n' + table.toString() + footer;
}

function formatLrScore(score: number): string {
  if (score >= 75) return chalk.green(String(score));
  if (score >= 60) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

function formatConfidence(r: LlmReviewResult): string {
  if (r.samples === undefined || r.samples <= 1) {
    // Descriptive single-judge check — no spread to surface.
    return chalk.dim('—');
  }

  const variance = r.variance ?? 0;
  const stddev = Math.sqrt(variance);
  const tag = `n=${r.samples} σ=${stddev.toFixed(1)}`;
  return r.lowConfidence ? chalk.yellow(`⚠ ${tag}`) : chalk.dim(tag);
}

function formatVerdict(verdict: SimulationResultEntry['verdict']): string {
  switch (verdict) {
    case 'resilient':
      return chalk.green('RESILIENT');
    case 'partial':
      return chalk.yellow('PARTIAL');
    case 'vulnerable':
      return chalk.red.bold('VULNERABLE');
  }
}

function formatRecommendations(recommendations: Recommendation[]): string {
  const lines = [chalk.bold.underline('Recommendations')];

  for (const rec of recommendations) {
    const priorityStr = formatPriority(rec.priority);
    lines.push('');
    lines.push(`  ${priorityStr} ${chalk.bold(rec.title)}`);
    lines.push(`     ${rec.description}`);
    lines.push(`     ${chalk.cyan('Fix:')} ${rec.howToFix}`);
  }

  return lines.join('\n');
}

function formatSeverity(severity: string): string {
  switch (severity) {
    case 'critical':
      return chalk.red.bold('CRITICAL');
    case 'warning':
      return chalk.yellow('WARNING');
    case 'info':
      return chalk.blue('INFO');
    default:
      return severity;
  }
}

function formatPriority(
  priority: 'critical' | 'high' | 'medium' | 'low',
): string {
  switch (priority) {
    case 'critical':
      return chalk.red('●');
    case 'high':
      return chalk.yellow('●');
    case 'medium':
      return chalk.blue('●');
    case 'low':
      return chalk.dim('●');
  }
}

function getGradeColor(grade: string): (text: string) => string {
  switch (grade) {
    case 'A':
      return chalk.green.bold;
    case 'B':
      return chalk.green;
    case 'C':
      return chalk.yellow;
    case 'D':
      return chalk.red;
    case 'F':
      return chalk.red.bold;
    default:
      return chalk.white;
  }
}

function getRecommendationColor(rec: string): (text: string) => string {
  switch (rec) {
    case 'ready':
      return chalk.green.bold;
    case 'needs-fixes':
      return chalk.yellow;
    case 'not-ready':
      return chalk.red.bold;
    default:
      return chalk.white;
  }
}
