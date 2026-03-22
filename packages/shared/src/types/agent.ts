export type AgentRole = 'orchestrator' | 'specialist';

export type ClaudeModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'claude-haiku-4-5-20251001';

export interface ModelConfig {
  model: ClaudeModel;
  maxTokens: number;
  temperature: number;
  topP?: number;
  stopSequences?: string[];
}

export interface AgentPermissions {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canCreateFiles: boolean;
  canDeleteFiles: boolean;
  allowedPaths: string[];
  deniedPaths: string[];
}

export interface Agent {
  id: string;
  projectId: string;
  role: AgentRole;
  name: string;
  slug: string;
  description: string;
  systemPrompt: string;
  modelConfig: ModelConfig;
  permissions: AgentPermissions;
  templateId: string | null;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  projectId: string;
  role: AgentRole;
  name: string;
  description?: string;
  systemPrompt: string;
  modelConfig: ModelConfig;
  permissions?: Partial<AgentPermissions>;
  templateId?: string;
  color?: string;
  icon?: string;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  modelConfig?: Partial<ModelConfig>;
  permissions?: Partial<AgentPermissions>;
  color?: string;
  icon?: string;
}
