#!/usr/bin/env node
/**
 * Validates all test fixtures against the agent-config JSON Schema.
 * Exit 0 = all valid, exit 1 = validation errors found.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = resolve(import.meta.dirname, '..');
const schemaPath = join(root, 'schemas', 'agent-config.schema.json');
const fixturesDir = join(root, 'tests', 'fixtures');

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

let failed = false;
for (const file of files) {
  const data = JSON.parse(readFileSync(join(fixturesDir, file), 'utf-8'));
  const valid = validate(data);
  if (!valid) {
    console.error(`FAIL: ${file}`);
    for (const err of validate.errors) {
      console.error(`  ${err.instancePath || '/'} — ${err.message}`);
    }
    failed = true;
  } else {
    console.log(`PASS: ${file}`);
  }
}

if (failed) {
  process.exitCode = 1;
  console.error('\nSchema validation failed for one or more fixtures.');
} else {
  console.log('\nAll fixtures valid.');
}
