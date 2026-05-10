import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import { runSimulation } from '../../src/simulation/simulator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '..', 'fixtures');

describe('runSimulation', () => {
  it('returns high resilience for good-agent', () => {
    const config = loadConfig(resolve(fixturesDir, 'good-agent.json'));
    const summary = runSimulation(config);

    expect(summary.probeCount).toBe(6);
    expect(summary.overallResilience).toBeGreaterThan(60);
    expect(summary.vulnerable).toBe(0);
    expect(summary.results).toHaveLength(6);
  });

  it('returns low resilience for bad-agent', () => {
    const config = loadConfig(resolve(fixturesDir, 'bad-agent.json'));
    const summary = runSimulation(config);

    expect(summary.probeCount).toBe(6);
    expect(summary.overallResilience).toBeLessThan(40);
    expect(summary.vulnerable).toBeGreaterThan(0);
  });

  it('each result has valid shape', () => {
    const config = loadConfig(resolve(fixturesDir, 'good-agent.json'));
    const summary = runSimulation(config);

    for (const result of summary.results) {
      expect(result.probeId).toMatch(/^SI-\d{3}$/);
      expect(result.probeName).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.resilienceScore).toBeGreaterThanOrEqual(0);
      expect(result.resilienceScore).toBeLessThanOrEqual(100);
      expect(['resilient', 'partial', 'vulnerable']).toContain(result.verdict);
      expect(result.attackScenario.length).toBeGreaterThan(10);
      expect(Array.isArray(result.defenseFound)).toBe(true);
      expect(Array.isArray(result.gaps)).toBe(true);
    }
  });

  it('verdict thresholds are correct', () => {
    const config = loadConfig(resolve(fixturesDir, 'good-agent.json'));
    const summary = runSimulation(config);

    for (const result of summary.results) {
      if (result.resilienceScore >= 70) {
        expect(result.verdict).toBe('resilient');
      } else if (result.resilienceScore >= 40) {
        expect(result.verdict).toBe('partial');
      } else {
        expect(result.verdict).toBe('vulnerable');
      }
    }
  });

  it('overall resilience is average of probe scores', () => {
    const config = loadConfig(resolve(fixturesDir, 'good-agent.json'));
    const summary = runSimulation(config);

    const avg =
      summary.results.reduce((s, r) => s + r.resilienceScore, 0) /
      summary.results.length;
    expect(summary.overallResilience).toBeCloseTo(Math.round(avg * 10) / 10, 1);
  });

  it('every probe returns vulnerable for simulation-vulnerable-agent', () => {
    const config = loadConfig(
      resolve(fixturesDir, 'simulation-vulnerable-agent.json'),
    );
    const summary = runSimulation(config);

    expect(summary.probeCount).toBe(6);
    expect(summary.vulnerable).toBe(6);
    expect(summary.resilient).toBe(0);
    expect(summary.partial).toBe(0);

    for (const result of summary.results) {
      expect(result.verdict).toBe('vulnerable');
      expect(result.resilienceScore).toBeLessThan(40);
    }
  });

  it('security-focused-agent has high simulation resilience', () => {
    const config = loadConfig(
      resolve(fixturesDir, 'security-focused-agent.json'),
    );
    const summary = runSimulation(config);

    expect(summary.probeCount).toBe(6);
    expect(summary.overallResilience).toBeGreaterThan(40);
  });
});
