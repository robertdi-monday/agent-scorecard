import type { AgentConfig } from '../../config/types.js';
import type { LlmClient, LlmReviewCheck, LlmReviewResult } from '../types.js';
import { completeJson } from '../llm-client.js';

function buildPrompt(config: AgentConfig): string {
  return `You are evaluating an AI agent's instruction set for internal coherence.

GOAL: ${config.instructions.goal}
PLAN: ${config.instructions.plan}
USER PROMPT: ${config.instructions.userPrompt}

Evaluate:
1. Does the plan logically achieve the stated goal?
2. Are there contradictions between goal, plan, and user prompt?
3. Are there ambiguities that could cause the agent to behave unpredictably?

Respond with JSON:
{
  "coherent": boolean,
  "score": number (0-100),
  "issues": string[],
  "summary": string (one sentence)
}`;
}

export const instructionCoherenceCheck: LlmReviewCheck = {
  id: 'LR-001',
  name: 'Instruction Coherence',
  description:
    'Evaluates whether goal, plan, and userPrompt are internally consistent',
  severity: 'warning',
  category: 'LLM Review',

  async run(config: AgentConfig, client: LlmClient): Promise<LlmReviewResult> {
    const prompt = buildPrompt(config);
    const parsed = await completeJson(client, prompt);

    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary : 'No summary';

    return {
      checkId: 'LR-001',
      checkName: 'Instruction Coherence',
      severity: 'warning',
      score,
      passed: score >= 70,
      message:
        score >= 70
          ? `Instructions are coherent (score: ${score}/100).`
          : `Instruction coherence issues detected (score: ${score}/100). ${summary}`,
      recommendation:
        score < 70
          ? 'Review goal, plan, and user prompt for contradictions and ambiguities. Each should complement the others without overlap or conflict.'
          : undefined,
      rawResponse: parsed,
      evidence: { score, issues, summary },
    };
  },
};
