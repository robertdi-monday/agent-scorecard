import type { AgentConfig, AuditResult } from '../../config/types.js';
import type { LlmClient, LlmReviewResult, TailoredFix } from '../types.js';
import { completeJson } from '../llm-client.js';

function buildPrompt(
  config: AgentConfig,
  phase1Results: LlmReviewResult[],
  failedRules: AuditResult[],
  simulationGaps: string[],
): string {
  const toolList = config.tools
    .filter((t) => t.enabled)
    .map((t) => t.displayName || t.name)
    .join(', ');

  const issues: string[] = [];

  for (const r of failedRules) {
    issues.push(
      `[${r.ruleId}] ${r.message}${r.recommendation ? ` — Fix: ${r.recommendation}` : ''}`,
    );
  }

  for (const r of phase1Results.filter((p) => !p.passed)) {
    issues.push(
      `[${r.checkId}] ${r.message}${r.recommendation ? ` — Fix: ${r.recommendation}` : ''}`,
    );
  }

  for (const gap of simulationGaps) {
    issues.push(`[Simulation] ${gap}`);
  }

  return `You are a monday.com AI agent configuration expert. An agent has been audited and has the following issues that need fixing.

AGENT GOAL: ${config.instructions.goal}
AGENT PLAN: ${config.instructions.plan}
CURRENT INSTRUCTIONS: ${config.instructions.userPrompt}
ENABLED TOOLS: ${toolList || '(none)'}

ISSUES FOUND:
${issues.map((i) => `- ${i}`).join('\n')}

For each issue, write a specific instruction paragraph that the builder can copy-paste directly into their agent's instructions to fix the problem. The text should be written in the agent's voice and reference the specific tools and boards this agent uses.

Respond with JSON:
{
  "fixes": [
    {
      "related_check": string,
      "instruction_text": string,
      "placement": "prepend" | "append" | "replace"
    }
  ],
  "overall_instruction_rewrite": string | null
}`;
}

export function extractTailoredFixes(
  parsed: Record<string, unknown>,
): TailoredFix[] {
  const fixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];
  return fixes
    .filter(
      (f): f is Record<string, unknown> =>
        typeof f === 'object' && f !== null && !Array.isArray(f),
    )
    .map((f) => ({
      relatedCheck: typeof f.related_check === 'string' ? f.related_check : '',
      instructionText:
        typeof f.instruction_text === 'string' ? f.instruction_text : '',
      placement: normalizePlacement(f.placement),
    }))
    .filter((f) => f.instructionText.length > 0);
}

function normalizePlacement(val: unknown): 'prepend' | 'append' | 'replace' {
  if (val === 'prepend' || val === 'append' || val === 'replace') return val;
  return 'append';
}

export async function runTailoredRecommendations(
  config: AgentConfig,
  client: LlmClient,
  phase1Results: LlmReviewResult[],
  failedRules: AuditResult[],
  simulationGaps: string[],
): Promise<LlmReviewResult> {
  const hasIssues =
    failedRules.length > 0 ||
    simulationGaps.length > 0 ||
    phase1Results.some((r) => !r.passed);

  if (!hasIssues) {
    return {
      checkId: 'LR-005',
      checkName: 'Tailored Recommendations',
      severity: 'info',
      score: 100,
      passed: true,
      message: 'No issues to generate recommendations for.',
      rawResponse: {},
      evidence: { fixes: [] },
    };
  }

  const prompt = buildPrompt(
    config,
    phase1Results,
    failedRules,
    simulationGaps,
  );
  const parsed = await completeJson(client, prompt);
  const fixes = extractTailoredFixes(parsed);

  return {
    checkId: 'LR-005',
    checkName: 'Tailored Recommendations',
    severity: 'info',
    score: 100,
    passed: true,
    message: `Generated ${fixes.length} tailored fix${fixes.length === 1 ? '' : 'es'}.`,
    rawResponse: parsed,
    evidence: {
      fixes,
      overall_instruction_rewrite: parsed.overall_instruction_rewrite ?? null,
    },
  };
}
