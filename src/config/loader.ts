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

  const VALID_KINDS = ['PERSONAL', 'ACCOUNT_LEVEL', 'EXTERNAL'];
  const VALID_STATES = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DELETED', 'FAILED'];
  requireEnum(obj, 'kind', VALID_KINDS, filePath);
  requireEnum(obj, 'state', VALID_STATES, filePath);

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

  for (let i = 0; i < kb.files.length; i++) {
    const entry = kb.files[i];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ConfigLoadError(
        `Invalid config: knowledgeBase.files[${i}] must be an object in ${filePath}.`,
      );
    }
    const fileObj = entry as Record<string, unknown>;
    requireString(fileObj, 'fileName', filePath, `knowledgeBase.files[${i}].`);
    requireString(
      fileObj,
      'sourceType',
      filePath,
      `knowledgeBase.files[${i}].`,
    );
  }

  // tools
  if (!Array.isArray(obj.tools)) {
    throw new ConfigLoadError(
      `Invalid config: 'tools' must be an array in ${filePath}.`,
    );
  }

  for (let i = 0; i < obj.tools.length; i++) {
    const entry = obj.tools[i];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ConfigLoadError(
        `Invalid config: tools[${i}] must be an object in ${filePath}.`,
      );
    }
    const toolObj = entry as Record<string, unknown>;
    requireString(toolObj, 'name', filePath, `tools[${i}].`);
    if (typeof toolObj.enabled !== 'boolean') {
      throw new ConfigLoadError(
        `Invalid config: tools[${i}].enabled must be a boolean in ${filePath}.`,
      );
    }
    const VALID_TOOL_TYPES = ['builtin', 'custom', 'app-feature'];
    const VALID_CONN_STATUS = ['ready', 'connected', 'not_connected'];
    requireEnum(toolObj, 'type', VALID_TOOL_TYPES, filePath, `tools[${i}].`);
    requireEnum(
      toolObj,
      'connectionStatus',
      VALID_CONN_STATUS,
      filePath,
      `tools[${i}].`,
    );
  }

  // triggers
  if (!Array.isArray(obj.triggers)) {
    throw new ConfigLoadError(
      `Invalid config: 'triggers' must be an array in ${filePath}.`,
    );
  }

  for (let i = 0; i < obj.triggers.length; i++) {
    const entry = obj.triggers[i];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ConfigLoadError(
        `Invalid config: triggers[${i}] must be an object in ${filePath}.`,
      );
    }
    const trig = entry as Record<string, unknown>;
    requireString(trig, 'name', filePath, `triggers[${i}].`);
    requireString(trig, 'blockReferenceId', filePath, `triggers[${i}].`);
    requireString(trig, 'triggerType', filePath, `triggers[${i}].`);
    if (
      typeof trig.triggerConfig !== 'object' ||
      trig.triggerConfig === null ||
      Array.isArray(trig.triggerConfig)
    ) {
      throw new ConfigLoadError(
        `Invalid config: triggers[${i}].triggerConfig must be an object in ${filePath}.`,
      );
    }
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
  const perms = obj.permissions as Record<string, unknown>;
  const VALID_SCOPE_TYPES = ['workspace', 'board', 'custom'];
  requireEnum(perms, 'scopeType', VALID_SCOPE_TYPES, filePath, 'permissions.');
  requireStringArray(perms, 'connectedBoards', filePath, 'permissions.');
  requireStringArray(perms, 'connectedDocs', filePath, 'permissions.');

  // Default optional arrays
  if (!Array.isArray(obj.skills)) {
    (obj as Record<string, unknown>).skills = [];
  } else {
    for (let i = 0; i < obj.skills.length; i++) {
      const entry = obj.skills[i];
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new ConfigLoadError(
          `Invalid config: skills[${i}] must be an object in ${filePath}.`,
        );
      }
      const sk = entry as Record<string, unknown>;
      requireString(sk, 'id', filePath, `skills[${i}].`);
      requireString(sk, 'name', filePath, `skills[${i}].`);
      requireString(sk, 'description', filePath, `skills[${i}].`);
    }
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

function requireEnum(
  obj: Record<string, unknown>,
  field: string,
  allowed: string[],
  filePath: string,
  prefix = '',
): void {
  const val = obj[field];
  if (typeof val !== 'string' || !allowed.includes(val)) {
    throw new ConfigLoadError(
      `Invalid config: '${prefix}${field}' must be one of [${allowed.join(', ')}] in ${filePath}. Got: ${JSON.stringify(val)}.`,
    );
  }
}

function requireStringArray(
  obj: Record<string, unknown>,
  field: string,
  filePath: string,
  prefix = '',
): void {
  const val = obj[field];
  if (!Array.isArray(val)) {
    throw new ConfigLoadError(
      `Invalid config: '${prefix}${field}' must be an array in ${filePath}.`,
    );
  }
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== 'string') {
      throw new ConfigLoadError(
        `Invalid config: '${prefix}${field}[${i}]' must be a string in ${filePath}.`,
      );
    }
  }
}
