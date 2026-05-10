import type { AgentConfig, AuditRule } from '../config/types.js';
import {
  getInstructionText,
  findKeywords,
  jaccardSimilarity,
} from './auditor-utils.js';
import { STOP_WORDS } from '../config/constants.js';

/**
 * EF-001 (warning): Detect duplicated instruction segments.
 */
const ef001: AuditRule = {
  id: 'EF-001',
  name: 'Instruction duplication',
  description:
    'Instructions should not contain repeated phrases that waste context tokens.',
  severity: 'warning',
  category: 'Efficiency',
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

/**
 * EF-002 (warning): Tool count ratio — many tools + sparse instructions.
 */
const ef002: AuditRule = {
  id: 'EF-002',
  name: 'Tool count ratio',
  description:
    'Agents with many tools need adequate instructions to guide usage.',
  severity: 'warning',
  category: 'Efficiency',
  check(config: AgentConfig) {
    const enabledCount = config.tools.filter((t) => t.enabled).length;
    const instructionLength = getInstructionText(config).length;

    const passed = !(enabledCount > 10 && instructionLength < 500);
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? `Tool-to-instruction ratio is acceptable (${enabledCount} tools, ${instructionLength} chars).`
        : `${enabledCount} tools enabled but instructions are only ${instructionLength} chars. The agent likely cannot distinguish when to use each tool.`,
      recommendation: passed
        ? undefined
        : "Either reduce enabled tools to those essential for the agent's purpose, or expand instructions to describe when each tool should be used.",
      evidence: { enabledToolCount: enabledCount, instructionLength },
    };
  },
};

/**
 * EF-003 (critical): Circular skill dependencies.
 */
const ef003: AuditRule = {
  id: 'EF-003',
  name: 'Circular skill dependencies',
  description: 'Skills should not reference each other in a cycle.',
  severity: 'critical',
  category: 'Efficiency',
  check(config: AgentConfig) {
    const skills = config.skills;
    const circularPairs: [string, string][] = [];

    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const aDesc = skills[i].description.toLowerCase();
        const bDesc = skills[j].description.toLowerCase();
        const aName = skills[i].name.toLowerCase();
        const bName = skills[j].name.toLowerCase();

        if (aDesc.includes(bName) && bDesc.includes(aName)) {
          circularPairs.push([skills[i].name, skills[j].name]);
        }
      }
    }

    const passed = circularPairs.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? 'No circular skill dependencies detected.'
        : `Potential circular dependency between skills: ${circularPairs.map((p) => `${p[0]} <-> ${p[1]}`).join(', ')}.`,
      recommendation: passed
        ? undefined
        : 'Ensure skills have clear, non-overlapping responsibilities. A skill should never delegate back to a skill that called it.',
      evidence: { circularPairs },
    };
  },
};

/**
 * EF-004 (info): Prompt bloat detection — low information density.
 */
const ef004: AuditRule = {
  id: 'EF-004',
  name: 'Prompt bloat detection',
  description: 'Instructions should have high information density.',
  severity: 'info',
  category: 'Efficiency',
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

/**
 * EF-005 (info): Knowledge base file relevance overlap.
 */
const ef005: AuditRule = {
  id: 'EF-005',
  name: 'KB file relevance overlap',
  description:
    'Knowledge base files should not have highly similar names suggesting duplication.',
  severity: 'info',
  category: 'Efficiency',
  check(config: AgentConfig) {
    const files = config.knowledgeBase.files;
    const overlappingPairs: {
      fileA: string;
      fileB: string;
      similarity: number;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const nameA = files[i].fileName.replace(/\.[^.]+$/, '');
        const nameB = files[j].fileName.replace(/\.[^.]+$/, '');
        const sim = jaccardSimilarity(nameA, nameB);
        if (sim > 0.8) {
          overlappingPairs.push({
            fileA: files[i].fileName,
            fileB: files[j].fileName,
            similarity: Math.round(sim * 100),
          });
        }
      }
    }

    const passed = overlappingPairs.length === 0;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.severity,
      passed,
      message: passed
        ? 'No overlapping knowledge base file names detected.'
        : `Knowledge base files may overlap: ${overlappingPairs.map((p) => `${p.fileA} and ${p.fileB} have ${p.similarity}% name similarity`).join('; ')}.`,
      recommendation: passed
        ? undefined
        : 'Review potentially duplicate knowledge base files. Consolidate overlapping content to improve retrieval accuracy.',
      evidence: { overlappingPairs },
    };
  },
};

export const efficiencyRules: AuditRule[] = [ef001, ef002, ef003, ef004, ef005];
