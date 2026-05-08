import chalk from 'chalk';
import Table from 'cli-table3';
import type {
  ScorecardReport,
  AuditResult,
  Recommendation,
} from '../config/types.js';

/**
 * Format a ScorecardReport as a colored CLI table output.
 */
export function formatCliReport(report: ScorecardReport): string {
  const sections: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  sections.push(formatHeader(report));

  // ── Config Audit Results ───────────────────────────────────────────────────
  sections.push(formatResultsTable(report.layers.configAudit.results));

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
    const owaspTag =
      result.owaspAsi && result.owaspAsi.length > 0
        ? chalk.dim(` [${result.owaspAsi.join(', ')}]`)
        : '';

    const ruleName = `${result.ruleId}: ${result.ruleName}${owaspTag}`;

    table.push([icon, ruleName, severityStr, result.message]);
  }

  return table.toString();
}

function formatRecommendations(recommendations: Recommendation[]): string {
  const lines = [chalk.bold.underline('Recommendations')];

  for (const rec of recommendations) {
    const priorityStr = formatPriority(rec.priority);
    const owaspTag =
      rec.owaspAsi && rec.owaspAsi.length > 0
        ? chalk.dim(` [${rec.owaspAsi.join(', ')}]`)
        : '';

    lines.push('');
    lines.push(`  ${priorityStr} ${chalk.bold(rec.title)}${owaspTag}`);
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
