import type { AgentConfig, AuditRule } from '../config/types.js';
import { getInstructionText, jaccardSimilarity } from './auditor-utils.js';

// Full-mode-only rules (no `pillar` — require tools / KB to evaluate).
// C-004 (Completeness) and Q-001 (Quality) moved to their pillar-aware files.

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

export const efficiencyRules: AuditRule[] = [ef002, ef003, ef005];
