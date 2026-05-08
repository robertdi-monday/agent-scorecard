import { describe, it, expect, afterEach, vi } from 'vitest';
import { KB_STALENESS_DAYS } from '../../src/config/constants.js';
import { knowledgeBaseRules } from '../../src/auditors/knowledge-base-auditor.js';
import type { AgentConfig } from '../../src/config/types.js';
import goodAgent from '../fixtures/good-agent.json';
import badAgent from '../fixtures/bad-agent.json';
import edgeAgent from '../fixtures/edge-case-agent.json';

const [kb001, kb002, kb003] = knowledgeBaseRules;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = KB_STALENESS_DAYS * MS_PER_DAY;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KB-001: Knowledge base not empty', () => {
  it('passes when knowledge base has files', () => {
    const result = kb001.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when knowledge base is empty', () => {
    const result = kb001.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(false);
  });

  it('passes when knowledge base has one file', () => {
    const result = kb001.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('reports severity as critical', () => {
    const result = kb001.check(badAgent as unknown as AgentConfig);
    expect(result.severity).toBe('critical');
  });
});

describe('KB-002: Knowledge base relevance', () => {
  it('passes when file names contain goal-relevant terms', () => {
    const result = kb002.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('passes with message when KB is empty', () => {
    const result = kb002.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when file names do not match goal keywords', () => {
    const config: AgentConfig = {
      ...(edgeAgent as unknown as AgentConfig),
      instructions: {
        ...edgeAgent.instructions,
        goal: 'Handle quantum physics simulations',
      },
    };
    const result = kb002.check(config);
    expect(result.passed).toBe(false);
  });
});

describe('KB-003: Knowledge base freshness', () => {
  it('passes when all files are recently updated', () => {
    const result = kb003.check(goodAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('passes with info when no timestamps are present', () => {
    const result = kb003.check(edgeAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
    expect(result.evidence?.reason).toBe('no-timestamps');
  });

  it('fails when files are stale', () => {
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      knowledgeBase: {
        files: [
          {
            fileName: 'old-doc.pdf',
            sourceType: 'file',
            lastUpdated: '2024-01-01T00:00:00Z',
          },
        ],
      },
    };
    const result = kb003.check(config);
    expect(result.passed).toBe(false);
  });

  it('passes with message when KB is empty', () => {
    const result = kb003.check(badAgent as unknown as AgentConfig);
    expect(result.passed).toBe(true);
  });

  it('fails when lastUpdated is not a parseable date', () => {
    const config: AgentConfig = {
      ...(edgeAgent as unknown as AgentConfig),
      knowledgeBase: {
        files: [
          {
            fileName: 'bad-date.pdf',
            sourceType: 'file',
            lastUpdated: 'not-a-date',
          },
        ],
      },
    };
    const result = kb003.check(config);
    expect(result.passed).toBe(false);
    expect(result.evidence?.invalidTimestampFiles).toContain('bad-date.pdf');
  });

  it('passes when newest timestamp is exactly at staleness threshold', () => {
    const now = Date.UTC(2026, 5, 15, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const updatedAt = new Date(now - STALE_THRESHOLD_MS).toISOString();
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      knowledgeBase: {
        files: [
          { fileName: 'x.pdf', sourceType: 'file', lastUpdated: updatedAt },
        ],
      },
    };
    expect(kb003.check(config).passed).toBe(true);
  });

  it('fails when file is one ms older than threshold', () => {
    const now = Date.UTC(2026, 5, 15, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const updatedAt = new Date(now - STALE_THRESHOLD_MS - 1).toISOString();
    const config: AgentConfig = {
      ...(goodAgent as unknown as AgentConfig),
      knowledgeBase: {
        files: [
          { fileName: 'stale.pdf', sourceType: 'file', lastUpdated: updatedAt },
        ],
      },
    };
    expect(kb003.check(config).passed).toBe(false);
  });
});
