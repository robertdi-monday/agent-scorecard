#!/usr/bin/env node
/**
 * Validates all test fixtures against the agent-config JSON Schema.
 * Exit 0 = all valid, exit 1 = validation errors found.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = resolve(import.meta.dirname, '..');
const schemaPath = join(root, 'schemas', 'agent-config.schema.json');
const fixturesDir = join(root, 'tests', 'fixtures');

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

/** Recursively collect every .json file under `dir`. Subdirectories like
 *  `per-rule/` and `incidents/` ship valid AgentConfig fixtures too. */
function collectJsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectJsonFiles(full));
    } else if (entry.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

const files = collectJsonFiles(fixturesDir);

let failed = false;
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  const valid = validate(data);
  const label = relative(root, file);
  if (!valid) {
    console.error(`FAIL: ${label}`);
    for (const err of validate.errors) {
      console.error(`  ${err.instancePath || '/'} — ${err.message}`);
    }
    failed = true;
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failed) {
  process.exitCode = 1;
  console.error('\nSchema validation failed for one or more fixtures.');
} else {
  console.log('\nAll fixtures valid.');
}
