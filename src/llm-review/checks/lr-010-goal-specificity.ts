import type { AgentConfig } from '../../config/types.js';
import type { LlmClient, LlmReviewCheck, LlmReviewResult } from '../types.js';
import { completeJson } from '../llm-client.js';

/**
 * C-007 — Goal specificity.
 *
 * A vague goal ("help users with grants") leaves the agent without a clear
 * decision boundary. A specific goal ("Screen Pell grant applicants for
 * Title IV eligibility against the criteria in our 2026 KB") gives the LLM
 * a concrete success criterion. The check rates specificity along three
 * axes: domain, measurable outcome, scope boundary.
 */
function buildPrompt(config: AgentConfig): string {
  const goal = config.instructions.goal || '(empty)';
  return `You are evaluating the specificity of an AI agent's goal statement.

GOAL:
"""
${goal}
"""

Rate the goal on three axes (0-100 each):
1. DOMAIN: Is the subject matter named with enough specificity that the agent knows what it's about? (e.g. "grant management" is moderate; "Pell grant Title IV eligibility" is specific.)
2. MEASURABLE OUTCOME: Does the goal name a measurable outcome the agent should produce? (e.g. "screen applicants" is moderate; "produce an eligibility report with pass/fail per criterion" is specific.)
3. SCOPE BOUNDARY: Does the goal indicate what's IN and OUT of scope? (e.g. "no procurement, no payroll" → high; goal silent → low.)

The overall score is the mean of the three axes.

Respond with JSON:
{
  "score": number (0-100, mean of axes),
  "axes": { "domain": number, "outcome": number, "scope": number },
  "weaknesses": string[],
  "improved_goal_example": string,
  "summary": string
}`;
}

export const goalSpecificityCheck: LlmReviewCheck = {
  id: 'C-007',
  name: 'Goal Specificity',
  description:
    'Goal must be specific along three axes: domain, measurable outcome, and scope boundary. Vague goals lead to unpredictable agent behavior.',
  severity: 'warning',
  category: 'Completeness',
  pillar: 'Completeness',
  agentPromptSnippet: `**C-007 — Goal Specificity (warning, pass >= 70)**
Rate the goal on three axes (domain, measurable outcome, scope boundary), 0-100 each. Overall score = mean.
Expected output: { score: 0-100, axes: {domain, outcome, scope}, weaknesses: string[], improved_goal_example: string, summary: string }
PASS if score >= 70.`,

  async run(config: AgentConfig, client: LlmClient): Promise<LlmReviewResult> {
    const prompt = buildPrompt(config);
    const parsed = await completeJson(client, prompt);

    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    const axes = (parsed.axes as Record<string, unknown>) || {};
    const weaknesses = Array.isArray(parsed.weaknesses)
      ? parsed.weaknesses
      : [];
    const improved =
      typeof parsed.improved_goal_example === 'string'
        ? parsed.improved_goal_example
        : '';
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary : 'No summary';

    return {
      checkId: 'C-007',
      checkName: 'Goal Specificity',
      severity: 'warning',
      score,
      passed: score >= 70,
      message:
        score >= 70
          ? `Goal is specific (score ${score}/100).`
          : `Goal lacks specificity (score ${score}/100). ${summary}`,
      recommendation:
        score < 70
          ? `Rewrite the goal to name a specific domain, a measurable outcome, and an explicit scope boundary. Example: "${improved}"`
          : undefined,
      rawResponse: parsed,
      evidence: {
        score,
        axes,
        weaknesses,
        improved_goal_example: improved,
        summary,
      },
    };
  },
};
