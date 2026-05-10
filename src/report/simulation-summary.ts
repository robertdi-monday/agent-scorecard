import type { SimulationSummary } from '../simulation/types.js';

export function summarizeSimulationLayer(summary: SimulationSummary) {
  return {
    overallResilience: summary.overallResilience,
    probeCount: summary.probeCount,
    resilient: summary.resilient,
    partial: summary.partial,
    vulnerable: summary.vulnerable,
  };
}
