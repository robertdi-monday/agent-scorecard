/**
 * Coverage for `completeJsonSampled` median-aggregation correctness. Without
 * this, a regression that quietly switched median → mean would be invisible
 * because every other test in this suite returns the same response across
 * all k samples, making median == mean trivially.
 */
import { describe, it, expect } from 'vitest';
import { completeJsonSampled } from '../../src/llm-review/llm-client.js';
import type { LlmClient } from '../../src/llm-review/types.js';

/**
 * Build a client that returns a sequence of canned responses, one per call.
 * Throws if more calls are made than responses provided so missing k=N coverage
 * is loud.
 */
function sequencedClient(responses: string[]): LlmClient {
  let i = 0;
  return {
    async complete(): Promise<string> {
      if (i >= responses.length) {
        throw new Error(
          `sequencedClient ran out of responses at call ${i + 1}/${responses.length}`,
        );
      }
      const out = responses[i];
      i++;
      return out;
    },
  };
}

function failingThenOkClient(
  failuresFirst: number,
  okScore: number,
): LlmClient {
  let i = 0;
  return {
    async complete(): Promise<string> {
      if (i < failuresFirst) {
        i++;
        throw new Error('LLM call failed: 500');
      }
      i++;
      return JSON.stringify({ score: okScore, summary: 'ok' });
    },
  };
}

describe('completeJsonSampled — median aggregation', () => {
  it('returns median (not mean) for [40, 50, 90]', async () => {
    const client = sequencedClient([
      JSON.stringify({ score: 40, summary: 'low' }),
      JSON.stringify({ score: 50, summary: 'mid' }),
      JSON.stringify({ score: 90, summary: 'high' }),
    ]);
    const result = await completeJsonSampled(client, 'prompt', { k: 3 });
    // mean would be 60; median is 50. Asserting median catches the bug.
    expect(result.score).toBe(50);
    expect(result._samples).toBe(3);
    // _variance is (40-60)^2 + (50-60)^2 + (90-60)^2 = 400+100+900 = 1400 / 3 ≈ 466.67
    expect(result._variance).toBeCloseTo(466.67, 1);
    // Winner sample (closest to median) is the 50 sample — preserves rationale.
    expect(result.summary).toBe('mid');
  });

  it('returns median for an even-length sample set [60, 80] = 70', async () => {
    const client = sequencedClient([
      JSON.stringify({ score: 60, summary: 's1' }),
      JSON.stringify({ score: 80, summary: 's2' }),
    ]);
    const result = await completeJsonSampled(client, 'prompt', { k: 2 });
    expect(result.score).toBe(70);
  });

  it('returns median for [60, 60, 60, 60, 100] = 60 (not mean 68)', async () => {
    const client = sequencedClient([
      JSON.stringify({ score: 60, summary: 's1' }),
      JSON.stringify({ score: 60, summary: 's2' }),
      JSON.stringify({ score: 60, summary: 's3' }),
      JSON.stringify({ score: 60, summary: 's4' }),
      JSON.stringify({ score: 100, summary: 'outlier' }),
    ]);
    const result = await completeJsonSampled(client, 'prompt', { k: 5 });
    expect(result.score).toBe(60);
    expect(result._samples).toBe(5);
  });

  it('survives partial failures — returns the surviving sample(s) median', async () => {
    const client = failingThenOkClient(2, 75);
    const result = await completeJsonSampled(client, 'prompt', { k: 3 });
    // Only 1 successful sample at score 75. Median of [75] = 75.
    expect(result.score).toBe(75);
    expect(result._samples).toBe(1);
    expect(result._variance).toBe(0);
  });

  it('throws with a descriptive message when ALL k samples fail', async () => {
    const client: LlmClient = {
      async complete(): Promise<string> {
        throw new Error('LLM call failed: 500');
      },
    };
    await expect(
      completeJsonSampled(client, 'prompt', { k: 3 }),
    ).rejects.toThrow(/All 3 sampled LLM calls failed/);
  });

  it('falls back to k=1 (no shuffling, no _variance field) when k <= 1', async () => {
    const client = sequencedClient([
      JSON.stringify({ score: 42, summary: 'one shot' }),
    ]);
    const result = await completeJsonSampled(client, 'prompt', { k: 1 });
    expect(result.score).toBe(42);
    expect(result._samples).toBeUndefined();
    expect(result._variance).toBeUndefined();
  });

  it('preserves rationale fields from the median sample (not the first sample)', async () => {
    // Order: high, low, median. The winner should be the median, surfacing its rationale.
    const client = sequencedClient([
      JSON.stringify({ score: 90, summary: 'first sample, high' }),
      JSON.stringify({ score: 30, summary: 'second sample, low' }),
      JSON.stringify({ score: 60, summary: 'third sample, the median' }),
    ]);
    const result = await completeJsonSampled(client, 'prompt', { k: 3 });
    expect(result.score).toBe(60);
    expect(result.summary).toBe('third sample, the median');
  });
});
