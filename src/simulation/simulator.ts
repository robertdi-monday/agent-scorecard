import type { AgentConfig } from '../config/types.js';
import type { SimulationProbe, SimulationSummary } from './types.js';
import { promptInjectionProbe } from './probes/prompt-injection.js';
import { toolMisuseProbe } from './probes/tool-misuse.js';
import { scopeEscapeProbe } from './probes/scope-escape.js';
import { hallucinationProbe } from './probes/hallucination.js';
import { errorCascadeProbe } from './probes/error-cascade.js';
import { dataExfiltrationProbe } from './probes/data-exfiltration.js';

const ALL_PROBES: SimulationProbe[] = [
  promptInjectionProbe,
  toolMisuseProbe,
  scopeEscapeProbe,
  hallucinationProbe,
  errorCascadeProbe,
  dataExfiltrationProbe,
];

export function runSimulation(config: AgentConfig): SimulationSummary {
  const results = ALL_PROBES.map((p) => p.run(config));

  const overallResilience =
    results.length > 0
      ? Math.round(
          (results.reduce((sum, r) => sum + r.resilienceScore, 0) /
            results.length) *
            10,
        ) / 10
      : 100;

  return {
    overallResilience,
    probeCount: results.length,
    resilient: results.filter((r) => r.verdict === 'resilient').length,
    partial: results.filter((r) => r.verdict === 'partial').length,
    vulnerable: results.filter((r) => r.verdict === 'vulnerable').length,
    results,
  };
}
