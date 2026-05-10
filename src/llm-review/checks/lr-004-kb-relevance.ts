import type { AgentConfig } from '../../config/types.js';
import type { LlmClient, LlmReviewCheck, LlmReviewResult } from '../types.js';
import { completeJson } from '../llm-client.js';

function buildPrompt(config: AgentConfig): string {
  const files = config.knowledgeBase.files
    .map((f) => `- ${f.fileName} (type: ${f.sourceType})`)
    .join('\n');

  return `You are evaluating whether an AI agent's knowledge base files are relevant to its stated purpose.

AGENT GOAL: ${config.instructions.goal}
AGENT PLAN: ${config.instructions.plan}

KNOWLEDGE BASE FILES:
${files || '(none)'}

For each file, assess:
1. Based on the filename and type, is this likely relevant to the agent's purpose?
2. Are there obvious gaps — topics the agent should have documentation for but doesn't?

Respond with JSON:
{
  "relevant": boolean,
  "score": number (0-100),
  "file_assessments": [
    { "file": string, "relevant": boolean, "reason": string }
  ],
  "suggested_additions": string[],
  "summary": string
}`;
}

export const kbRelevanceCheck: LlmReviewCheck = {
  id: 'LR-004',
  name: 'Knowledge Base Relevance',
  description:
    'Evaluates semantic relevance of knowledge base files to agent purpose',
  severity: 'info',
  category: 'LLM Review',

  async run(config: AgentConfig, client: LlmClient): Promise<LlmReviewResult> {
    if (config.knowledgeBase.files.length === 0) {
      return {
        checkId: 'LR-004',
        checkName: 'Knowledge Base Relevance',
        severity: 'info',
        score: 100,
        passed: true,
        message: 'No knowledge base files to evaluate.',
        rawResponse: {},
        evidence: { score: 100, file_assessments: [], summary: 'No KB files' },
      };
    }

    const prompt = buildPrompt(config);
    const parsed = await completeJson(client, prompt);

    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    const fileAssessments = Array.isArray(parsed.file_assessments)
      ? parsed.file_assessments
      : [];
    const suggestedAdditions = Array.isArray(parsed.suggested_additions)
      ? parsed.suggested_additions
      : [];
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary : 'No summary';

    return {
      checkId: 'LR-004',
      checkName: 'Knowledge Base Relevance',
      severity: 'info',
      score,
      passed: score >= 60,
      message:
        score >= 60
          ? `Knowledge base files are relevant (score: ${score}/100).`
          : `Knowledge base relevance is low (score: ${score}/100). ${summary}`,
      recommendation:
        score < 60
          ? 'Review knowledge base files for relevance to agent goal. Remove unrelated files and add documentation for gaps identified.'
          : undefined,
      rawResponse: parsed,
      evidence: {
        score,
        file_assessments: fileAssessments,
        suggested_additions: suggestedAdditions,
        summary,
      },
    };
  },
};
