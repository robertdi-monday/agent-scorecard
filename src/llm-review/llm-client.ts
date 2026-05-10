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
