/**
 * Writes docs/SCORECARD_AGENT_USER_PROMPT.md for manual paste into monday
 * Agent Builder (User prompt). Source: buildAgentPrompt().
 *
 * Usage: npx tsx scripts/export-scorecard-agent-prompt-md.ts
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentPrompt } from '../src/agent-builder/build-agent-prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'docs', 'SCORECARD_AGENT_USER_PROMPT.md');

const prompt = buildAgentPrompt();

const header = `# Scorecard Agent — User prompt for monday

Use this file to **copy the agent instructions** into **Agent Builder → your Scorecard agent → User prompt** (replace the entire field).

## What to copy

Copy **only the block under the line** \`---\` below — from the first line \`You are the Agent Scorecard evaluator\` through the **end of the file**. Do **not** include the markdown heading or this instructions section.

**Source of truth:** \`src/agent-builder/build-agent-prompt.ts\` (\`buildAgentPrompt()\`). After changing rules or prompt text, regenerate:

\`\`\`bash
npm run export:agent-prompt-md
\`\`\`

---

`;

writeFileSync(outPath, header + prompt, 'utf-8');
console.log(`Wrote ${outPath} (${header.length + prompt.length} chars).`);
