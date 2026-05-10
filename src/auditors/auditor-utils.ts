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

/** Jaccard similarity between two word sets. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
