import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Compiled entry — avoids tsx IPC (fails under restricted sandboxes / CI). */
const cliJs = join(root, 'dist', 'cli.js');
const fixturesDir = resolve(root, 'tests', 'fixtures');

function runAuditCli(args: string[]) {
  return spawnSync(process.execPath, [cliJs, 'audit', ...args], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env },
  });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-scorecard-cli-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CLI audit (subprocess)', () => {
  it('exits 0 for ready fixture with sled-grant', () => {
    const config = join(fixturesDir, 'good-agent.json');
    const r = runAuditCli(['--config', config, '--vertical', 'sled-grant']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SLED Grant Management Assistant|Grade|A/i);
  });

  it('exits 1 when deployment recommendation is not-ready', () => {
    const config = join(fixturesDir, 'bad-agent.json');
    const r = runAuditCli(['--config', config, '--vertical', 'sled-grant']);
    expect(r.status).toBe(1);
  });

  it('exits 2 when config file cannot be loaded', () => {
    const missing = join(tmpDir, 'missing.json');
    const r = runAuditCli(['--config', missing]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Error:/);
  });

  it('writes JSON report when --format json --output path', () => {
    const config = join(fixturesDir, 'edge-case-agent.json');
    const out = join(tmpDir, 'report.json');
    const r = runAuditCli([
      '--config',
      config,
      '--format',
      'json',
      '--output',
      out,
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Report written/);
    const json = JSON.parse(readFileSync(out, 'utf-8'));
    expect(json.metadata.agentId).toBeDefined();
    expect(json.layers.configAudit).toHaveProperty('infoIssues');
    expect(json.layers.configAudit.results.length).toBe(13);
  });

  it('prints JSON to stdout when --format json without --output', () => {
    const config = join(fixturesDir, 'good-agent.json');
    const r = runAuditCli([
      '--config',
      config,
      '--vertical',
      'sled-grant',
      '--format',
      'json',
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.overallGrade).toBe('A');
  });
});
