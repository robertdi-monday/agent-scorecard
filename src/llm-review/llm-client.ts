import type { LlmClient, LlmCallOptions } from './types.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 1024;

export function createAnthropicClient(apiKey: string): LlmClient {
  return {
    async complete(prompt: string, options?: LlmCallOptions): Promise<string> {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: options?.model ?? DEFAULT_MODEL,
          max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: options?.temperature ?? 0.0,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        throw new Error(`LLM call failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as {
        content: Array<{ text: string }>;
      };
      return data.content[0].text;
    },
  };
}

/**
 * Extract a JSON object from an LLM response that may contain markdown
 * fences, preamble text, or other non-JSON content.
 */
export function extractJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // continue to fallbacks
  }

  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  const braceStart = raw.indexOf('{');
  if (braceStart !== -1) {
    let depth = 0;
    for (let i = braceStart; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.substring(braceStart, i + 1)) as Record<
            string,
            unknown
          >;
        } catch {
          // continue
        }
        break;
      }
    }
  }

  throw new Error('Failed to extract JSON from LLM response');
}

const STRICT_SUFFIX =
  '\n\nRespond ONLY with the JSON object. No markdown fences, no preamble, no explanation.';

/**
 * Send a prompt expecting a JSON response. Parses the result and retries
 * once with a stricter prompt if the first attempt is unparseable.
 */
export async function completeJson(
  client: LlmClient,
  prompt: string,
  options?: LlmCallOptions,
): Promise<Record<string, unknown>> {
  const raw = await client.complete(prompt, options);
  try {
    return extractJson(raw);
  } catch {
    // retry with stricter instructions
  }

  const retryRaw = await client.complete(prompt + STRICT_SUFFIX, options);
  return extractJson(retryRaw);
}

// ── Multi-judge sampling (Phase 0.5) ────────────────────────────────────────

export interface SampledJsonOptions extends LlmCallOptions {
  /** How many samples to draw. Defaults to 3. */
  k?: number;
  /** Field to aggregate over. Defaults to "score". */
  numericField?: string;
  /**
   * Pre-amble shuffler for framing-bias mitigation. Receives the prompt and
   * the sample index (0..k-1) and returns a re-framed prompt. Defaults to
   * appending a deterministic randomization hint per sample.
   */
  shuffle?: (prompt: string, sampleIndex: number) => string;
}

const DEFAULT_SHUFFLE_FRAMINGS = [
  '',
  '\n\nIMPORTANT: Read the instructions carefully and consider counter-evidence before scoring.',
  '\n\nIMPORTANT: Be strict — flag every concrete weakness even if minor.',
];

function defaultShuffle(prompt: string, sampleIndex: number): string {
  const framing =
    DEFAULT_SHUFFLE_FRAMINGS[sampleIndex % DEFAULT_SHUFFLE_FRAMINGS.length];
  return `${prompt}${framing}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.round((sq / values.length) * 100) / 100;
}

/**
 * Run k LLM judgments on the same prompt with shuffled framing, aggregate
 * the numeric `score` (or other field) via median, and return the median
 * sample annotated with a `_variance` field on the evidence so callers can
 * surface confidence to the user.
 *
 * Use this for any LR check whose pass/fail decision is materially affected
 * by score noise — currently S-003, S-004, S-005, and S-009. Descriptive
 * checks (Q-002, Q-003, C-007, LR-004) stay at k=1 via `completeJson`.
 *
 * Falls back to k=1 if k <= 1 to keep test/mock paths simple.
 */
export async function completeJsonSampled(
  client: LlmClient,
  prompt: string,
  options?: SampledJsonOptions,
): Promise<Record<string, unknown>> {
  const k = options?.k ?? 3;
  const numericField = options?.numericField ?? 'score';
  const shuffle = options?.shuffle ?? defaultShuffle;
  const baseOptions: LlmCallOptions = {
    ...options,
    temperature: options?.temperature ?? 0.7,
  };

  if (k <= 1) {
    return completeJson(client, prompt, baseOptions);
  }

  const samples: Record<string, unknown>[] = [];
  const errors: unknown[] = [];

  for (let i = 0; i < k; i++) {
    try {
      const reframed = shuffle(prompt, i);
      const parsed = await completeJson(client, reframed, baseOptions);
      samples.push(parsed);
    } catch (err) {
      errors.push(err);
    }
  }

  if (samples.length === 0) {
    throw new Error(
      `All ${k} sampled LLM calls failed: ${
        errors[0] instanceof Error ? errors[0].message : String(errors[0])
      }`,
    );
  }

  const scores = samples
    .map((s) => s[numericField])
    .filter((v): v is number => typeof v === 'number');

  if (scores.length === 0) {
    // No numeric field — return first sample with a note.
    const first = samples[0];
    return {
      ...first,
      _samples: samples.length,
      _variance: 0,
    };
  }

  const med = median(scores);
  const v = variance(scores);

  // Return the sample whose score is closest to the median (preserves rationale).
  const winner = samples.reduce((best, s) => {
    const sScore =
      typeof s[numericField] === 'number' ? (s[numericField] as number) : 0;
    const bScore =
      typeof best[numericField] === 'number'
        ? (best[numericField] as number)
        : 0;
    return Math.abs(sScore - med) < Math.abs(bScore - med) ? s : best;
  }, samples[0]);

  return {
    ...winner,
    [numericField]: med,
    _samples: samples.length,
    _variance: v,
    _allScores: scores,
  };
}
