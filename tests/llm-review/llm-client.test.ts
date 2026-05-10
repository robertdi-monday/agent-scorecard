import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAnthropicClient,
  extractJson,
  completeJson,
} from '../../src/llm-review/llm-client.js';

describe('extractJson', () => {
  it('parses raw JSON directly', () => {
    const result = extractJson('{"score": 85}');
    expect(result).toEqual({ score: 85 });
  });

  it('extracts JSON from markdown fenced block', () => {
    const raw = 'Here is the result:\n```json\n{"score": 75}\n```\nDone.';
    expect(extractJson(raw)).toEqual({ score: 75 });
  });

  it('extracts JSON from unfenced markdown block', () => {
    const raw = '```\n{"score": 60}\n```';
    expect(extractJson(raw)).toEqual({ score: 60 });
  });

  it('extracts first balanced braces from preamble text', () => {
    const raw = 'The analysis shows: {"score": 42, "issues": ["a"]} and more.';
    expect(extractJson(raw)).toEqual({ score: 42, issues: ['a'] });
  });

  it('throws on completely non-JSON text', () => {
    expect(() => extractJson('no json here at all')).toThrow(
      'Failed to extract JSON',
    );
  });

  it('handles nested braces', () => {
    const raw = 'Preamble {"a": {"b": 1}} tail';
    expect(extractJson(raw)).toEqual({ a: { b: 1 } });
  });
});

describe('createAnthropicClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends correct headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"ok": true}' }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createAnthropicClient('test-key-123');
    await client.complete('hello');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key-123',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }),
      }),
    );
  });

  it('throws on non-200 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      }),
    );

    const client = createAnthropicClient('key');
    await expect(client.complete('hello')).rejects.toThrow('429');
  });

  it('uses default model when none specified', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{}' }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createAnthropicClient('key');
    await client.complete('hello');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.temperature).toBe(0.0);
  });
});

describe('completeJson', () => {
  it('parses valid JSON response on first try', async () => {
    const client = {
      complete: vi.fn().mockResolvedValue('{"score": 90}'),
    };
    const result = await completeJson(client, 'test prompt');
    expect(result).toEqual({ score: 90 });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it('retries with stricter prompt on first failure', async () => {
    const client = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('not json')
        .mockResolvedValueOnce('{"score": 50}'),
    };
    const result = await completeJson(client, 'test');
    expect(result).toEqual({ score: 50 });
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(client.complete.mock.calls[1][0]).toContain('Respond ONLY');
  });

  it('throws if both attempts fail', async () => {
    const client = {
      complete: vi.fn().mockResolvedValue('still not json'),
    };
    await expect(completeJson(client, 'test')).rejects.toThrow(
      'Failed to extract JSON',
    );
  });
});
