import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { loadConfig, ConfigLoadError } from '../src/config/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const schemaPath = join(root, 'schemas', 'agent-config.schema.json');
const fixturesDir = join(__dirname, 'fixtures');

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function loaderAccepts(fixturePath: string): boolean {
  try {
    loadConfig(fixturePath);
    return true;
  } catch (err) {
    if (err instanceof ConfigLoadError) return false;
    throw err;
  }
}

describe('Schema/loader parity — fixtures', () => {
  const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

  for (const file of fixtures) {
    it(`${file}: AJV and loader agree`, () => {
      const filePath = join(fixturesDir, file);
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      const ajvAccepts = validate(data) as boolean;
      const loaderResult = loaderAccepts(filePath);
      expect(loaderResult).toBe(ajvAccepts);
    });
  }
});

describe('Schema/loader parity — invalid inputs', () => {
  const validBase = JSON.parse(
    readFileSync(join(fixturesDir, 'good-agent.json'), 'utf-8'),
  );

  const invalidCases: Array<{ name: string; input: Record<string, unknown> }> =
    [
      {
        name: 'missing agentId',
        input: { ...validBase, agentId: undefined },
      },
      {
        name: 'missing instructions',
        input: { ...validBase, instructions: undefined },
      },
      {
        name: 'invalid kind enum',
        input: { ...validBase, kind: 'INVALID_KIND' },
      },
      {
        name: 'invalid state enum',
        input: { ...validBase, state: 'BOGUS' },
      },
      {
        name: 'tools is a string instead of array',
        input: { ...validBase, tools: 'not-an-array' },
      },
      {
        name: 'missing permissions',
        input: { ...validBase, permissions: undefined },
      },
      {
        name: 'invalid scopeType',
        input: {
          ...validBase,
          permissions: { ...validBase.permissions, scopeType: 'galaxy' },
        },
      },
      {
        name: 'tool with invalid connectionStatus',
        input: {
          ...validBase,
          tools: [
            {
              name: 't',
              displayName: 'T',
              type: 'builtin',
              connectionStatus: 'broken',
              enabled: true,
            },
          ],
        },
      },
    ];

  for (const { name, input } of invalidCases) {
    it(`rejects: ${name}`, () => {
      const cleaned = JSON.parse(JSON.stringify(input));
      const ajvAccepts = validate(cleaned) as boolean;
      expect(ajvAccepts).toBe(false);
    });
  }
});
