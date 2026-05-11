import type { AgentConfig, AuditRule } from '../config/types.js';
import { getInstructionText } from './auditor-utils.js';
import { STOP_WORDS } from '../config/constants.js';

// ── Q-001: Information density ──────────────────────────────────────────────

const q001: AuditRule = {
  id: 'Q-001',
  name: 'Information density',
  description: 'Instructions should have high information density.',
  severity: 'info',
  category: 'Quality',
  pillar: 'Quality',
  agentPromptSnippet: `**Q-001 — Information Density (info)**
Tokenize instruction text into words. Filter out English stop words. Calculate density = unique_meaningful_words / total_words.
- Density < 0.3: FAIL — most words are filler.
- Density >= 0.3: PASS.`,
  check(config: AgentConfig) {
    const text = getInstructionText(config);
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const totalWords = words.length;

    if (totalWords === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        passed: true,
        message: 'No instruction text to analyze.',
        evidence: { uniqueMeaningfulWords: 0, totalWords: 0, density: 0 },
      };
    }

    const meaningfulWords = words.filter((w) => !STOP_WORDS.has(w));
    const uniqueMeaningful = new Set(meaningfulWords).size;
    const density = Math.round((uniqueMeaningful / totalWords) * 100) / 100;

    const passed = density >= 0.3;
    const pct = Math.round((1 - density) * 100);
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Instruction density is acceptable (${density}).`
        : `Instruction density is low (${density}). ${pct}% of words are filler. This wastes context tokens and dilutes important instructions.`,
      recommendation: passed
        ? undefined
        : 'Tighten instruction language. Remove filler phrases, redundant qualifiers, and unnecessary preamble. Focus on actionable directives.',
      evidence: {
        uniqueMeaningfulWords: uniqueMeaningful,
        totalWords,
        density,
      },
    };
  },
};

export const qualityRules: AuditRule[] = [q001];
