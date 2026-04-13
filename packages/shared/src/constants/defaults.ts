import type { AgentPermissions } from '../types/agent.js';
import type { Settings } from '../types/settings.js';

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  canReadFiles: true,
  canWriteFiles: true,
  canCreateFiles: true,
  canDeleteFiles: false,
  allowedPaths: ['**/*'],
  deniedPaths: ['node_modules/**', '.git/**', '.env*'],
};

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  openAiApiKey: '',
  geminiApiKey: '',
  defaultModel: 'claude-sonnet-4-20250514',
  defaultMaxTokens: 8192,
  theme: 'dark',
  defaultWorkspacePath: '',
  maxConcurrentAgents: 3,
  autoSaveInterval: 30000,
};

export const AGENT_COLORS: Record<string, string> = {
  orchestrator: '#8b5cf6',
  backend: '#06b6d4',
  frontend: '#f97316',
  database: '#3b82f6',
  devops: '#22c55e',
  qa: '#ec4899',
  documentation: '#a78bfa',
  design: '#f472b6',
  custom: '#71717a',
};

export const AGENT_ICONS: Record<string, string> = {
  orchestrator: 'Brain',
  backend: 'Server',
  frontend: 'Monitor',
  database: 'Database',
  devops: 'Container',
  qa: 'TestTube2',
  documentation: 'FileText',
  design: 'Palette',
  custom: 'Bot',
};
