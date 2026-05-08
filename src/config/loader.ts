import { readFileSync } from 'node:fs';
import type { AgentConfig } from './types.js';

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

export function loadConfig(filePath: string): AgentConfig {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    throw new ConfigLoadError(
      `Failed to read config file: ${filePath}. Ensure the file exists and is readable.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigLoadError(
      `Failed to parse config file: ${filePath}. Ensure it is valid JSON.`,
    );
  }

  return validateConfig(parsed, filePath);
}

function validateConfig(data: unknown, filePath: string): AgentConfig {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ConfigLoadError(
      `Invalid config: ${filePath} must contain a JSON object.`,
    );
  }

  const obj = data as Record<string, unknown>;

  requireString(obj, 'agentId', filePath);
  requireString(obj, 'agentName', filePath);

  // instructions
  if (
    typeof obj.instructions !== 'object' ||
    obj.instructions === null ||
    Array.isArray(obj.instructions)
  ) {
    throw new ConfigLoadError(
      `Invalid config: missing required field 'instructions' in ${filePath}.`,
    );
  }
  const instructions = obj.instructions as Record<string, unknown>;
  requireString(instructions, 'goal', filePath, 'instructions.');
  requireString(instructions, 'plan', filePath, 'instructions.');

  // knowledgeBase
  if (
    typeof obj.knowledgeBase !== 'object' ||
    obj.knowledgeBase === null ||
    Array.isArray(obj.knowledgeBase)
  ) {
    throw new ConfigLoadError(
      `Invalid config: missing required field 'knowledgeBase' in ${filePath}.`,
    );
  }
  const kb = obj.knowledgeBase as Record<string, unknown>;
  if (!Array.isArray(kb.files)) {
    throw new ConfigLoadError(
      `Invalid config: 'knowledgeBase.files' must be an array in ${filePath}.`,
    );
  }

  // tools
  if (!Array.isArray(obj.tools)) {
    throw new ConfigLoadError(
      `Invalid config: 'tools' must be an array in ${filePath}.`,
    );
  }

  // triggers
  if (!Array.isArray(obj.triggers)) {
    throw new ConfigLoadError(
      `Invalid config: 'triggers' must be an array in ${filePath}.`,
    );
  }

  // permissions
  if (
    typeof obj.permissions !== 'object' ||
    obj.permissions === null ||
    Array.isArray(obj.permissions)
  ) {
    throw new ConfigLoadError(
      `Invalid config: missing required field 'permissions' in ${filePath}.`,
    );
  }

  // Default optional arrays
  if (!Array.isArray(obj.skills)) {
    (obj as Record<string, unknown>).skills = [];
  }
  if (!instructions.userPrompt) {
    instructions.userPrompt = '';
  }

  return obj as unknown as AgentConfig;
}

function requireString(
  obj: Record<string, unknown>,
  field: string,
  filePath: string,
  prefix = '',
): void {
  if (typeof obj[field] !== 'string' || (obj[field] as string).trim() === '') {
    throw new ConfigLoadError(
      `Invalid config: missing required field '${prefix}${field}' in ${filePath}.`,
    );
  }
}
