import type { ScorecardReport } from '../../config/types.js';

interface MondayApi {
  api: <T = unknown>(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ data: T }>;
}

export interface ExportResult {
  boardId: string;
  boardUrl: string;
}

export async function exportToBoard(
  monday: MondayApi,
  report: ScorecardReport,
): Promise<ExportResult> {
  const datePart = report.metadata.timestamp.slice(0, 10);
  const boardName = `Agent Scorecard — ${report.metadata.agentName} — ${datePart}`;

  const boardId = await createBoard(monday, boardName);

  const cols = await createColumns(monday, boardId);

  const summaryItemId = await createSummaryItem(
    monday,
    boardId,
    report,
    cols,
  );

  await createRuleSubitems(monday, summaryItemId, report, cols);

  const accountSlug = await getAccountSlug(monday);
  const boardUrl = accountSlug
    ? `https://${accountSlug}.monday.com/boards/${boardId}`
    : `https://monday.com/boards/${boardId}`;

  return { boardId, boardUrl };
}

async function createBoard(
  monday: MondayApi,
  name: string,
): Promise<string> {
  const { data } = await monday.api<{
    create_board: { id: string };
  }>(
    `mutation ($name: String!) {
      create_board(board_name: $name, board_kind: private) { id }
    }`,
    { variables: { name } },
  );
  return data.create_board.id;
}

interface ColumnIds {
  score: string;
  grade: string;
  deployment: string;
  passed: string;
  failed: string;
  warnings: string;
  ruleId: string;
  category: string;
  severity: string;
  result: string;
  message: string;
  recommendation: string;
}

async function createColumn(
  monday: MondayApi,
  boardId: string,
  title: string,
  columnType: string,
): Promise<string> {
  const { data } = await monday.api<{
    create_column: { id: string };
  }>(
    `mutation ($boardId: ID!, $title: String!, $columnType: ColumnType!) {
      create_column(board_id: $boardId, title: $title, column_type: $columnType) { id }
    }`,
    { variables: { boardId, title, columnType } },
  );
  return data.create_column.id;
}

async function createColumns(
  monday: MondayApi,
  boardId: string,
): Promise<ColumnIds> {
  const [score, grade, deployment, passed, failed, warnings, ruleId, category, severity, result, message, recommendation] =
    await Promise.all([
      createColumn(monday, boardId, 'Score', 'numbers'),
      createColumn(monday, boardId, 'Grade', 'status'),
      createColumn(monday, boardId, 'Deployment', 'status'),
      createColumn(monday, boardId, 'Passed', 'numbers'),
      createColumn(monday, boardId, 'Failed', 'numbers'),
      createColumn(monday, boardId, 'Warnings', 'numbers'),
      createColumn(monday, boardId, 'Rule ID', 'text'),
      createColumn(monday, boardId, 'Category', 'text'),
      createColumn(monday, boardId, 'Severity', 'status'),
      createColumn(monday, boardId, 'Result', 'status'),
      createColumn(monday, boardId, 'Message', 'text'),
      createColumn(monday, boardId, 'Recommendation', 'long_text'),
    ]);

  return { score, grade, deployment, passed, failed, warnings, ruleId, category, severity, result, message, recommendation };
}

async function createSummaryItem(
  monday: MondayApi,
  boardId: string,
  report: ScorecardReport,
  cols: ColumnIds,
): Promise<string> {
  const colValues: Record<string, unknown> = {
    [cols.score]: report.overallScore,
    [cols.grade]: { label: report.overallGrade },
    [cols.deployment]: { label: report.deploymentRecommendation },
    [cols.passed]: report.layers.configAudit.passed,
    [cols.failed]: report.layers.configAudit.failed,
    [cols.warnings]: report.layers.configAudit.warnings,
  };

  const { data } = await monday.api<{
    create_item: { id: string };
  }>(
    `mutation ($boardId: ID!, $itemName: String!, $colValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $colValues) { id }
    }`,
    {
      variables: {
        boardId,
        itemName: `${report.metadata.agentName} — ${report.overallGrade} (${Math.round(report.overallScore)})`,
        colValues: JSON.stringify(colValues),
      },
    },
  );
  return data.create_item.id;
}

async function createRuleSubitems(
  monday: MondayApi,
  parentItemId: string,
  report: ScorecardReport,
  cols: ColumnIds,
): Promise<void> {
  const results = report.layers.configAudit.results;

  // monday rate-limits heavily — sequential to avoid 429s
  for (const r of results) {
    const colValues: Record<string, unknown> = {
      [cols.ruleId]: r.ruleId,
      [cols.category]: r.ruleName,
      [cols.severity]: { label: r.severity },
      [cols.result]: { label: r.passed ? 'pass' : 'fail' },
      [cols.message]: r.message,
      ...(r.recommendation
        ? { [cols.recommendation]: { text: r.recommendation } }
        : {}),
    };

    await monday.api(
      `mutation ($parentItemId: ID!, $itemName: String!, $colValues: JSON!) {
        create_subitem(parent_item_id: $parentItemId, item_name: $itemName, column_values: $colValues, create_labels_if_missing: true) { id }
      }`,
      {
        variables: {
          parentItemId,
          itemName: `${r.ruleId}: ${r.passed ? 'PASS' : 'FAIL'}`,
          colValues: JSON.stringify(colValues),
        },
      },
    );
  }
}

async function getAccountSlug(monday: MondayApi): Promise<string | null> {
  try {
    const { data } = await monday.api<{
      me: { account: { slug: string } };
    }>(`query { me { account { slug } } }`);
    return data.me.account.slug || null;
  } catch {
    return null;
  }
}
