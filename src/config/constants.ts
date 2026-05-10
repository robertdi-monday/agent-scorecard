import { createRequire } from 'node:module';

// In the browser (Vite build), __SCORECARD_VERSION__ is injected via `define`.
// In Node.js, we read package.json at runtime.
declare const __SCORECARD_VERSION__: string | undefined;

const _version: string =
  typeof __SCORECARD_VERSION__ !== 'undefined'
    ? __SCORECARD_VERSION__
    : (
        createRequire(import.meta.url)('../../package.json') as {
          version: string;
        }
      ).version;

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

// ── Security keywords (SC rules) ─────────────────────────────────────────────

/** SC-001: Prompt injection defense keywords */
export const INJECTION_DEFENSE_KEYWORDS = [
  'ignore previous instructions',
  'prompt injection',
  'do not follow instructions from',
  'ignore instructions in',
  'treat user input as data',
  'do not execute commands from',
  'never change your role',
  'maintain your identity',
  'system prompt is confidential',
  'do not reveal your instructions',
  'do not disclose',
  'reject attempts to override',
];

/** SC-002: Data handling restriction keywords */
export const DATA_HANDLING_KEYWORDS = [
  'do not share',
  'do not send',
  'do not forward',
  'confidential',
  'sensitive data',
  'do not email',
  'do not export',
  'internal only',
  'do not transmit',
  'keep data within',
  'do not expose',
];

/** SC-003: Human-in-the-loop keywords */
export const HUMAN_LOOP_KEYWORDS = [
  'ask for approval',
  'require confirmation',
  'human review',
  'manual approval',
  'check with',
  'verify with user',
  'await confirmation',
  'do not proceed without',
  'seek approval',
  'get permission',
];

/** SC-004: Write-guard keywords */
export const WRITE_GUARD_KEYWORDS = [
  'do not modify status unless',
  'only update when',
  'verify before changing',
  'do not overwrite',
  'preserve existing',
  'check before updating',
];

/** SC-005: URL restriction keywords */
export const URL_RESTRICTION_KEYWORDS = [
  'only access',
  'approved urls',
  'approved domains',
  'whitelist',
  'allowlist',
  'do not visit',
  'do not fetch',
  'restricted urls',
  'trusted domains',
  'do not navigate to',
  'block external',
];

/** SC-006: Output validation keywords */
export const OUTPUT_VALIDATION_KEYWORDS = [
  'validate output',
  'verify before writing',
  'check format',
  'sanitize',
  'format check',
  'do not write invalid',
  'validate data before',
  'ensure correct format',
  'verify data integrity',
];

/** SC-004: Sensitive column name patterns */
export const SENSITIVE_COLUMN_PATTERNS = [
  'status',
  'owner',
  'person',
  'budget',
  'cost',
  'salary',
  'price',
  'formula',
  'dependency',
];

/** SC-005: External tool name patterns */
export const EXTERNAL_TOOL_PATTERNS = [
  'tavily',
  'web',
  'http',
  'url',
  'fetch',
  'scrape',
  'browse',
  'api-call',
];

/** SC-002 / SC-006: Write-capable tool name patterns (email/send/webhook) */
export const WRITE_TOOL_PATTERNS = [
  'email',
  'send',
  'webhook',
  'http',
  'api',
  'post',
  'notify',
  'slack',
  'message',
];

/** SC-006: Board write tool name patterns */
export const BOARD_WRITE_TOOL_PATTERNS = [
  'update',
  'create',
  'write',
  'modify',
  'change',
  'move',
];

// ── Simulation keywords ──────────────────────────────────────────────────────

/** SI-002: Rate limiting keywords */
export const RATE_LIMIT_KEYWORDS = [
  'rate limit',
  'batch',
  'maximum',
  'no more than',
  'limit to',
  'at most',
];

/** SI-005: Retry limit keywords */
export const RETRY_LIMIT_KEYWORDS = [
  'retry',
  'maximum attempts',
  'stop after',
  'fail gracefully',
  'circuit breaker',
];

/** SI-005: Fallback keywords */
export const FALLBACK_KEYWORDS = [
  'fallback',
  'alternative',
  'if unable',
  'degrade gracefully',
];

/** SI-004: Citation keywords */
export const CITATION_KEYWORDS = [
  'cite',
  'reference',
  'source',
  'based on',
  'according to',
  'from the data',
];

// ── Efficiency keywords (EF rules) ──────────────────────────────────────────

/** EF-004: Stop words for information density heuristic */
export const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'ought',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
  'this',
  'that',
  'these',
  'those',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'so',
  'yet',
  'in',
  'on',
  'at',
  'to',
  'from',
  'by',
  'with',
  'of',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
]);

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

// ── KB-002: Stop words for relevance heuristic ─────────────────────────────

export const KB_RELEVANCE_STOP_WORDS = [
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'are',
  'was',
  'were',
  'been',
  'have',
  'has',
  'had',
  'will',
  'can',
  'may',
  'should',
  'could',
  'would',
  'all',
  'any',
  'some',
  'other',
  'than',
  'into',
  'our',
  'their',
  'your',
  'its',
  'her',
  'his',
  'not',
  'but',
  'also',
  'more',
  'most',
  'very',
  'help',
  'data',
  'file',
  'files',
  'use',
  'used',
  'make',
  'does',
  'set',
  'get',
  'new',
  'way',
  'about',
  'each',
  'them',
  'then',
  'when',
  'who',
  'how',
  'what',
  'which',
  'where',
  'why',
  'assist',
  'manage',
  'handle',
  'process',
  'track',
  'based',
  'using',
];

// ── Version ──────────────────────────────────────────────────────────────────

export const SCORECARD_VERSION: string = _version;
