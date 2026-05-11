import { describe, it, expect } from 'vitest';
import {
  inferAutonomyTier,
  tierAwareReady,
} from '../../src/scoring/autonomy-tier.js';
import type { AgentConfig } from '../../src/config/types.js';

function makeConfig(overrides: {
  kind?: AgentConfig['kind'];
  plan?: string;
  userPrompt?: string;
}): AgentConfig {
  return {
    agentId: 'test',
    agentName: 'Test',
    kind: overrides.kind ?? 'PERSONAL',
    state: 'ACTIVE',
    instructions: {
      goal: 'A test goal that is long enough to satisfy section length checks easily.',
      plan: overrides.plan ?? 'A simple read-only assistant.',
      userPrompt: overrides.userPrompt ?? '',
    },
    knowledgeBase: { files: [] },
    tools: [],
    triggers: [],
    permissions: { scopeType: 'board', connectedBoards: [], connectedDocs: [] },
    skills: [],
  };
}

describe('inferAutonomyTier', () => {
  it('PERSONAL with narrow surface → Tier 1', () => {
    const inf = inferAutonomyTier(
      makeConfig({
        kind: 'PERSONAL',
        plan: 'Read-only analysis only. Restricted to a single board.',
      }),
    );
    expect(inf.tier).toBe(1);
    expect(inf.signals.surface).toBe('narrow');
  });

  it('PERSONAL with broad surface → Tier 2', () => {
    const inf = inferAutonomyTier(
      makeConfig({
        kind: 'PERSONAL',
        plan: 'Send email, webhook to external API, browse the web.',
      }),
    );
    expect(inf.tier).toBe(2);
    expect(inf.signals.surface).toBe('broad');
  });

  it('ACCOUNT_LEVEL default (moderate) surface → Tier 3', () => {
    const inf = inferAutonomyTier(
      makeConfig({
        kind: 'ACCOUNT_LEVEL',
        plan: 'A general assistant for the team.',
      }),
    );
    expect(inf.tier).toBe(3);
  });

  it('ACCOUNT_LEVEL with narrow surface → Tier 2', () => {
    const inf = inferAutonomyTier(
      makeConfig({
        kind: 'ACCOUNT_LEVEL',
        plan: 'Read-only analysis only. Restricted to dashboards.',
      }),
    );
    expect(inf.tier).toBe(2);
  });

  it('ACCOUNT_LEVEL with broad surface → Tier 4', () => {
    const inf = inferAutonomyTier(
      makeConfig({
        kind: 'ACCOUNT_LEVEL',
        plan: 'Across all boards, send email, webhook, payment processing.',
      }),
    );
    expect(inf.tier).toBe(4);
  });

  it('EXTERNAL is always Tier 4', () => {
    const inf = inferAutonomyTier(
      makeConfig({
        kind: 'EXTERNAL',
        plan: 'Read-only analysis only.',
      }),
    );
    expect(inf.tier).toBe(4);
  });
});

describe('tierAwareReady', () => {
  it('Tier 1 ready at score 75', () => {
    expect(tierAwareReady(1, 75, 'B').ready).toBe(true);
    expect(tierAwareReady(1, 74, 'C').ready).toBe(false);
  });

  it('Tier 4 ready only at score 90+', () => {
    expect(tierAwareReady(4, 90, 'A').ready).toBe(true);
    expect(tierAwareReady(4, 89, 'B').ready).toBe(false);
  });

  it('F grade is never ready regardless of score', () => {
    expect(tierAwareReady(1, 100, 'F').ready).toBe(false);
    expect(tierAwareReady(1, 100, 'F').reason).toBe('block-on-critical');
  });

  it('reason explains the tier requirement', () => {
    const r = tierAwareReady(4, 80, 'B');
    expect(r.ready).toBe(false);
    expect(r.reason).toContain('Tier 4');
    expect(r.reason).toContain('>= 90');
  });
});
