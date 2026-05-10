/** Raw response from GET /monday-agents/agent-management/agents-by-user */
export interface InternalAgentResponse {
  id: number;
  appFeatureId: number;
  kind: string;
  state: string;
  goal: string;
  plan: string;
  userPrompt: string;
  profile: {
    name: string;
    avatarUrl?: string;
  };
  tools: InternalTool[];
  mcpTools: InternalMcpTool[];
  knowledge: InternalKnowledgeFile[];
  scopePermissions: InternalScopePermission[];
  skills: InternalSkill[];
  members: InternalMember[];
  triggers?: InternalTrigger[];
}

export interface InternalTool {
  blockReferenceId: number;
  enabled: boolean;
}

export interface InternalMcpTool {
  kind: string;
  enabled: boolean;
  mcpServer: string;
  description: string;
  displayName: string;
}

export interface InternalKnowledgeFile {
  id: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
}

export interface InternalScopePermission {
  scopeType: string;
  boardId?: number;
  docId?: number;
}

export interface InternalSkill {
  id: string;
  name: string;
  description: string;
}

export interface InternalMember {
  userId: number;
  role: string;
}

export interface InternalTrigger {
  triggerId: string;
  triggerType: string;
  fieldSelections?: Record<string, unknown>;
}
