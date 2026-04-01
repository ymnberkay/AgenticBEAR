export type Provider = 'vscode-lm' | 'anthropic' | 'openai';

export interface Agent {
  id: string;
  name: string;
  role: 'orchestrator' | 'specialist';
  provider: Provider;
  model: string;
  systemPrompt: string;
  color?: string;
}

export interface AgentConfig {
  agents: Agent[];
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  output: string;
  error?: boolean;
}

export interface PlanStep {
  agentId: string;
  agentName: string;
  task: string;
}

export interface Plan {
  steps: PlanStep[];
  summary: string;
}

export interface TaskResult {
  agentName: string;
  task: string;
  filesCreated: string[];
  filesModified: string[];
  output: string;
  error?: string;
}

export interface ChatMessage {
  type: 'user' | 'agent' | 'system' | 'tool' | 'error';
  agentName?: string;
  content: string;
  timestamp: number;
}
