import type { ModelConfig, AgentPermissions } from './agent.js';

export type TemplateCategory =
  | 'orchestrator'
  | 'backend'
  | 'frontend'
  | 'database'
  | 'devops'
  | 'qa'
  | 'documentation'
  | 'design'
  | 'custom';

export interface PromptTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  systemPrompt: string;
  defaultModelConfig: ModelConfig;
  defaultPermissions: AgentPermissions;
  suggestedIcon: string;
  suggestedColor: string;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  category: TemplateCategory;
  description: string;
  systemPrompt: string;
  defaultModelConfig?: Partial<ModelConfig>;
  defaultPermissions?: Partial<AgentPermissions>;
  suggestedIcon?: string;
  suggestedColor?: string;
}
