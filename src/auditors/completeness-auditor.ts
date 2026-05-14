import type { AgentConfig, AuditRule } from '../config/types.js';
import {
  INSTRUCTION_MIN_LENGTH,
  ERROR_HANDLING_KEYWORDS,
  SCOPE_BOUNDARY_KEYWORDS,
  SECTION_LENGTH_BOUNDS,
  STALE_AGENT_STATES,
} from '../config/constants.js';
import {
  findKeywords,
  getInstructionText,
  jaccardSimilarity,
} from './auditor-utils.js';

// ── C-001: Total instruction length floor ───────────────────────────────────

/**
 * C-001 used to be a lump-sum check that policed both an upper and a lower
 * bound. In v2 the upper bound moved to C-005 (per-section balance, which is
 * field-aware and more precise), so C-001 is now a floor-only check. It
 * still earns its keep because C-005's per-field minimums can pass on a
 * config where every section is just-barely-above the floor while the
 * combined text is still too sparse to give the agent enough to work with.
 */
const c001: AuditRule = {
  id: 'C-001',
  name: 'Total instruction length floor',
  description: `Combined instruction text must be at least ${INSTRUCTION_MIN_LENGTH} characters. Upper-bound and per-section balance are owned by C-005.`,
  severity: 'warning',
  category: 'Completeness',
  pillar: 'Completeness',
  agentPromptSnippet: `**C-001 — Total Instruction Length Floor (warning)**
Concatenate goal + plan + user_prompt. Total length must be at least ${INSTRUCTION_MIN_LENGTH} characters.
- Below ${INSTRUCTION_MIN_LENGTH}: FAIL — vague instructions cause unpredictable behavior.
- Otherwise: PASS.
Note: C-005 owns per-section length balance and the upper bound. C-001 is a floor-only check that catches "every section is technically populated but the combined prompt is still sparse" cases.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const len = text.length;

    if (len < INSTRUCTION_MIN_LENGTH) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: false,
        message: `Instructions are too short (${len} chars, minimum ${INSTRUCTION_MIN_LENGTH}). Vague instructions lead to unpredictable agent behavior.`,
        recommendation:
          'Add detailed instructions covering the agent goal, expected behavior, constraints, and error handling.',
        evidence: { length: len, threshold: INSTRUCTION_MIN_LENGTH },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed: true,
      message: `Instruction length is above the floor (${len} chars).`,
      evidence: { length: len },
    };
  },
};

// ── C-002: Error-handling guidance ──────────────────────────────────────────

const c002: AuditRule = {
  id: 'C-002',
  name: 'Error-handling guidance',
  description:
    'Instructions should include guidance for handling errors and missing data.',
  severity: 'warning',
  category: 'Completeness',
  pillar: 'Completeness',
  agentPromptSnippet: `**C-002 — Error-Handling Guidance (warning)**
Search for at least ONE of: ${ERROR_HANDLING_KEYWORDS.map((k) => `"${k}"`).join(', ')}.
- Zero matches: FAIL.
- One or more: PASS.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, ERROR_HANDLING_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} error-handling keyword(s): ${matches.join(', ')}.`
        : 'No error-handling guidance found in instructions.',
      recommendation: passed
        ? undefined
        : 'Add instructions for how the agent should behave when tools fail, data is missing, or errors occur.',
      evidence: { matchedKeywords: matches },
    };
  },
};

// ── C-003: Scope boundary definition ────────────────────────────────────────

const c003: AuditRule = {
  id: 'C-003',
  name: 'Scope boundary definition',
  description:
    'Instructions should explicitly define what the agent should NOT do.',
  severity: 'warning',
  category: 'Completeness',
  pillar: 'Completeness',
  owaspAsi: ['ASI-01'],
  agentPromptSnippet: `**C-003 — Scope Boundary Definition (warning)**
Search for at least ONE of: ${SCOPE_BOUNDARY_KEYWORDS.map((k) => `"${k}"`).join(', ')}.
- Zero matches: FAIL.
- One or more: PASS.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const matches = findKeywords(text, SCOPE_BOUNDARY_KEYWORDS);
    const passed = matches.length > 0;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Found ${matches.length} scope boundary keyword(s): ${matches.join(', ')}.`
        : 'No scope boundary definitions found in instructions.',
      recommendation: passed
        ? undefined
        : 'Add explicit boundaries such as "only operate on the X board", "do not access Y", or "restricted to Z tasks".',
      evidence: { matchedKeywords: matches },
      owaspAsi: this.owaspAsi,
    };
  },
};

// ── C-004: Instruction duplication ──────────────────────────────────────────

const c004: AuditRule = {
  id: 'C-004',
  name: 'Instruction duplication',
  description:
    'Instructions should not contain repeated phrases that waste context tokens.',
  severity: 'warning',
  category: 'Completeness',
  pillar: 'Completeness',
  agentPromptSnippet: `**C-004 — Instruction Duplication (warning)**
Split instruction text by sentence boundaries (. ! ?). For sentences > 20 chars, compare all pairs using Jaccard similarity on word sets. If similarity > 0.8, flag as duplicate.
- 2+ duplicated segments: FAIL.
- 0-1: PASS.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const sentences = text
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    const duplicated: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        if (jaccardSimilarity(sentences[i], sentences[j]) > 0.8) {
          const segment = sentences[i].slice(0, 80);
          if (!duplicated.includes(segment)) {
            duplicated.push(segment);
          }
        }
      }
    }

    const passed = duplicated.length < 2;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? 'No significant instruction duplication detected.'
        : `Found ${duplicated.length} duplicated instruction segments. Redundant instructions waste context tokens and can confuse the agent.`,
      recommendation: passed
        ? undefined
        : 'Remove duplicate instructions. Each instruction should appear exactly once. If emphasis is needed, use explicit priority markers instead of repetition.',
      evidence: { duplicatedSegments: duplicated },
    };
  },
};

// ── C-005: Per-section length balance (Tier A) ──────────────────────────────

const c005: AuditRule = {
  id: 'C-005',
  name: 'Per-section length balance',
  description:
    'Goal, plan, and user_prompt should each fall within their own length bounds.',
  severity: 'info',
  category: 'Completeness',
  pillar: 'Completeness',
  agentPromptSnippet: `**C-005 — Per-Section Length Balance (info)**
Per-field bounds: goal in [${SECTION_LENGTH_BOUNDS.goal[0]}, ${SECTION_LENGTH_BOUNDS.goal[1]}], plan in [${SECTION_LENGTH_BOUNDS.plan[0]}, ${SECTION_LENGTH_BOUNDS.plan[1]}], user_prompt in [${SECTION_LENGTH_BOUNDS.userPrompt[0]}, ${SECTION_LENGTH_BOUNDS.userPrompt[1]}]. Flag any section outside its bounds. Replaces the C-001 lump-sum check with structured per-field signal.`,
  check(config: AgentConfig) {
    const fields: Array<{
      name: string;
      key: 'goal' | 'plan' | 'userPrompt';
      length: number;
      bounds: readonly [number, number];
    }> = [
      {
        name: 'goal',
        key: 'goal',
        length: (config.instructions.goal || '').length,
        bounds: SECTION_LENGTH_BOUNDS.goal,
      },
      {
        name: 'plan',
        key: 'plan',
        length: (config.instructions.plan || '').length,
        bounds: SECTION_LENGTH_BOUNDS.plan,
      },
      {
        name: 'user_prompt',
        key: 'userPrompt',
        length: (config.instructions.userPrompt || '').length,
        bounds: SECTION_LENGTH_BOUNDS.userPrompt,
      },
    ];

    const tooShort = fields.filter((f) => f.length < f.bounds[0]);
    const tooLong = fields.filter((f) => f.length > f.bounds[1]);
    const balanced = tooShort.length === 0 && tooLong.length === 0;

    if (balanced) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: `All instruction sections are within their length bounds (goal=${fields[0].length}, plan=${fields[1].length}, user_prompt=${fields[2].length}).`,
        evidence: {
          lengths: Object.fromEntries(fields.map((f) => [f.name, f.length])),
        },
      };
    }

    const issues: string[] = [];
    for (const f of tooShort) {
      issues.push(
        `${f.name} is too short (${f.length} chars, min ${f.bounds[0]})`,
      );
    }
    for (const f of tooLong) {
      issues.push(
        `${f.name} is too long (${f.length} chars, max ${f.bounds[1]})`,
      );
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed: false,
      message: `Section length imbalance: ${issues.join('; ')}.`,
      recommendation:
        'Rebalance sections: keep the goal concise (50–500 chars), use the plan for structured steps (100–3000 chars), and put detailed instructions in user_prompt (200–8000 chars).',
      evidence: {
        lengths: Object.fromEntries(fields.map((f) => [f.name, f.length])),
        bounds: Object.fromEntries(fields.map((f) => [f.name, f.bounds])),
        tooShort: tooShort.map((f) => f.name),
        tooLong: tooLong.map((f) => f.name),
      },
    };
  },
};

// ── C-008: State / kind sanity (Tier A) ─────────────────────────────────────

const c008: AuditRule = {
  id: 'C-008',
  name: 'State and kind sanity',
  description:
    'Warn when the agent is in a non-running state or its kind warrants extra scrutiny.',
  severity: 'info',
  category: 'Completeness',
  pillar: 'Completeness',
  agentPromptSnippet: `**C-008 — State / Kind Sanity (info)**
Pure enum check. FAIL when state is in {INACTIVE, ARCHIVED, DELETED, FAILED} (auditing a non-running agent). Emit an INFO note when kind is ACCOUNT_LEVEL or EXTERNAL — these agents have larger blast radius and should be held to a higher bar (see GOV-001).`,
  check(config: AgentConfig) {
    const stateNotes: string[] = [];
    const kindNotes: string[] = [];

    if (STALE_AGENT_STATES.has(config.state)) {
      stateNotes.push(
        `Agent state is ${config.state} — auditing a non-running agent.`,
      );
    }

    if (config.kind === 'ACCOUNT_LEVEL') {
      kindNotes.push(
        'Agent kind is ACCOUNT_LEVEL — broader blast radius; hold to a higher bar.',
      );
    } else if (config.kind === 'EXTERNAL') {
      kindNotes.push(
        'Agent kind is EXTERNAL — highest blast radius; treat all output as untrusted by default.',
      );
    }

    const passed = stateNotes.length === 0;

    if (passed && kindNotes.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: `Agent is ACTIVE and ${config.kind}.`,
        evidence: { state: config.state, kind: config.kind },
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: [...stateNotes, ...kindNotes].join(' '),
      recommendation: !passed
        ? `Verify the agent should be audited in its current state (${config.state}). Re-activate or re-deploy if this audit is intended for a live agent.`
        : undefined,
      evidence: {
        state: config.state,
        kind: config.kind,
        stateNotes,
        kindNotes,
      },
    };
  },
};

export const completenessRules: AuditRule[] = [
  c001,
  c002,
  c003,
  c004,
  c005,
  c008,
];
