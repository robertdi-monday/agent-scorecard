// ── Severity weights for scoring ─────────────────────────────────────────────

export const SEVERITY_WEIGHTS = {
  critical: 3,
  warning: 2,
  info: 1,
} as const;

// ── Grade thresholds ─────────────────────────────────────────────────────────

export const GRADE_THRESHOLDS = {
  A: 90,
  B: 75,
  C: 60,
  D: 40,
} as const;

// ── Instruction length bounds (IN-001) ───────────────────────────────────────

export const INSTRUCTION_MIN_LENGTH = 100;
export const INSTRUCTION_MAX_LENGTH = 10_000;

// ── Knowledge base staleness (KB-003) ────────────────────────────────────────

export const KB_STALENESS_DAYS = 90;

// ── Keyword lists for instruction analysis ───────────────────────────────────

/** IN-002: Guardrail keywords — at least 1 must appear in instructions */
export const GUARDRAIL_KEYWORDS = [
  'never fabricate',
  'do not fabricate',
  "don't fabricate",
  'do not invent',
  "don't invent",
  'never guess',
  'do not guess',
  "don't guess",
  'escalate if unsure',
  'escalate when unsure',
  'ask for clarification',
  'refuse to answer',
  'decline to',
  'do not assume',
  "don't assume",
];

/** IN-003: Error-handling keywords — at least 1 must appear */
export const ERROR_HANDLING_KEYWORDS = [
  'if the tool fails',
  'if an error occurs',
  'when data is missing',
  'handle errors',
  'error handling',
  'fallback',
  'if unable to',
  'report the error',
  'notify the user',
  'when unavailable',
  'if fails',
];

/** IN-004: Scope boundary keywords — at least 1 must appear */
export const SCOPE_BOUNDARY_KEYWORDS = [
  'outside your scope',
  'out of scope',
  'not authorized',
  'not your responsibility',
  'only operate on',
  'restricted to',
  'limited to',
  'do not access',
  'should not access',
  'do not modify',
];

// ── SLED vertical keywords ───────────────────────────────────────────────────

/** SLED-001: Deadline accuracy keywords */
export const DEADLINE_KEYWORDS = [
  'deadline',
  'due date',
  'submission date',
  'verify date',
  'confirm date',
  'date accuracy',
  'exact date',
];

/** SLED-002: Financial no-fabrication — needs BOTH a no-fabrication AND a financial keyword */
export const FINANCIAL_NO_FABRICATION_KEYWORDS = [
  'never fabricate',
  'do not fabricate',
  'do not invent',
  'never invent',
  'do not make up',
];

export const FINANCIAL_CONTEXT_KEYWORDS = [
  'financial',
  'grant amount',
  'dollar',
  'funding',
  'budget',
  'award amount',
  'monetary',
  'cost',
];

/** SLED-003: Eligibility-related file name keywords */
export const ELIGIBILITY_FILE_KEYWORDS = [
  'eligibility',
  'criteria',
  'requirements',
  'qualifications',
  'guidelines',
];

/** SLED-004: Compliance terms in instructions */
export const COMPLIANCE_KEYWORDS = [
  'edgar',
  'sam.gov',
  'grants.gov',
  'compliance',
  'federal regulation',
  'cfr',
  'omb',
  'uniform guidance',
  'fafsa',
];

// ── TL-001: Unnecessary tool heuristics ──────────────────────────────────────

export const UNNECESSARY_TOOL_PATTERNS: Array<{
  goalKeywords: string[];
  unnecessaryTools: string[];
}> = [
  {
    goalKeywords: [
      'data retrieval',
      'lookup',
      'search board',
      'find items',
      'read-only',
      'reporting',
      'analysis',
      'dashboard',
    ],
    unnecessaryTools: [
      'tavily',
      'web-search',
      'web_search',
      'email-sender',
      'email_sender',
    ],
  },
  {
    goalKeywords: [
      'read-only',
      'reporting',
      'analysis',
      'dashboard',
      'monitor',
    ],
    unnecessaryTools: [
      'monday-write',
      'monday_write',
      'item-update',
      'item_update',
    ],
  },
];

// ── Version ──────────────────────────────────────────────────────────────────

export const SCORECARD_VERSION = '0.1.0';
