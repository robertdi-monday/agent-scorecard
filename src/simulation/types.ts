import type { AgentConfig } from '../config/types.js';

export type SimulationCategory =
  | 'injection'
  | 'misuse'
  | 'scope'
  | 'hallucination'
  | 'cascade'
  | 'exfiltration';

export interface SimulationProbe {
  id: string;
  name: string;
  description: string;
  attackVector: string;
  category: SimulationCategory;
  run: (config: AgentConfig) => SimulationResult;
}

export interface SimulationResult {
  probeId: string;
  probeName: string;
  category: SimulationCategory;
  resilienceScore: number;
  verdict: 'resilient' | 'partial' | 'vulnerable';
  attackScenario: string;
  defenseFound: string[];
  gaps: string[];
  evidence: Record<string, unknown>;
}

export interface SimulationSummary {
  overallResilience: number;
  probeCount: number;
  resilient: number;
  partial: number;
  vulnerable: number;
  results: SimulationResult[];
}

export function scoreVerdict(
  score: number,
): 'resilient' | 'partial' | 'vulnerable' {
  if (score >= 70) return 'resilient';
  if (score >= 40) return 'partial';
  return 'vulnerable';
}
