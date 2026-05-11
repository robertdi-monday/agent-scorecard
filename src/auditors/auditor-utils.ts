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

/**
 * Case-insensitive whole-word/whole-phrase keyword scan — returns matched
 * keywords. Multi-word phrases match on word boundaries so that, for example,
 * the bare phrase "decline to confirm dates" no longer false-positives against
 * the GUARDRAIL_KEYWORDS entry "decline to" (which is intended to require an
 * actual refusal action like "decline to answer").
 *
 * Implementation: normalize whitespace, then match each keyword as a single
 * token sequence anchored by `\b` on the outer word characters. We escape
 * regex metacharacters in keywords and treat any internal whitespace as
 * `\s+` so phrases tolerate normal spacing variation without bleeding into
 * adjacent words.
 */
export function findKeywords(text: string, keywords: string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (matchKeyword(text, kw)) matched.push(kw);
  }
  return matched;
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

/** True iff the keyword phrase appears in text as a whole-word match. */
export function matchKeyword(text: string, keyword: string): boolean {
  const trimmed = keyword.trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/).map(escapeRegex);
  // \b only anchors next to a `\w` character; for keywords that begin or end
  // with a non-word char (e.g. "-----BEGIN") fall back to a permissive boundary.
  const startsWithWord = /^\w/.test(trimmed);
  const endsWithWord = /\w$/.test(trimmed);
  const left = startsWithWord ? '\\b' : '';
  const right = endsWithWord ? '\\b' : '';
  const re = new RegExp(`${left}${tokens.join('\\s+')}${right}`, 'i');
  return re.test(text);
}

/** Jaccard similarity between two word sets. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
