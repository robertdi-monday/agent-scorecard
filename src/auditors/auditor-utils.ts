import type { AgentConfig } from '../config/types.js';

/** Combine all instruction text for analysis. */
export function getInstructionText(config: AgentConfig): string {
  return [
    config.instructions.goal,
    config.instructions.plan,
    config.instructions.userPrompt,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Case-insensitive keyword scan — returns matched keywords. */
export function findKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}
