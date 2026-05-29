import type { ClaudeModel } from './agent.js';

export interface Settings {
  apiKey: string;
  openAiApiKey: string;
  geminiApiKey: string;
  defaultModel: ClaudeModel;
  defaultMaxTokens: number;
  theme: 'dark' | 'light';
  defaultWorkspacePath: string;
  maxConcurrentAgents: number;
  autoSaveInterval: number;
}

export interface UpdateSettingsInput {
  apiKey?: string;
  openAiApiKey?: string;
  geminiApiKey?: string;
  defaultModel?: ClaudeModel;
  defaultMaxTokens?: number;
  theme?: 'dark' | 'light';
  defaultWorkspacePath?: string;
  maxConcurrentAgents?: number;
  autoSaveInterval?: number;
}
