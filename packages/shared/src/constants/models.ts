import type { ClaudeModel, ModelConfig } from '../types/agent.js';

export const MODEL_GROUPS: { label: string; models: ClaudeModel[] }[] = [
  {
    label: 'Anthropic — Current',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  },
  {
    label: 'Anthropic — Legacy',
    models: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-haiku-20240307'],
  },
  {
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'gpt-5-mini', 'o3', 'o3-mini', 'o1'],
  },
  {
    label: 'OpenAI Codex',
    models: ['codex-1'],
  },
];

export const CLAUDE_MODELS: Record<ClaudeModel, { label: string; contextWindow: number; costPer1kInput: number; costPer1kOutput: number }> = {
  'claude-opus-4-6': {
    label: 'Claude Opus 4.6',
    contextWindow: 1000000,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
  },
  'claude-sonnet-4-6': {
    label: 'Claude Sonnet 4.6',
    contextWindow: 1000000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-haiku-4-5-20251001': {
    label: 'Claude Haiku 4.5',
    contextWindow: 200000,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
  },
  'claude-opus-4-5-20251101': {
    label: 'Claude Opus 4.5',
    contextWindow: 200000,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
  },
  'claude-sonnet-4-5-20250929': {
    label: 'Claude Sonnet 4.5',
    contextWindow: 1000000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-opus-4-1-20250805': {
    label: 'Claude Opus 4.1',
    contextWindow: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  'claude-opus-4-20250514': {
    label: 'Claude Opus 4',
    contextWindow: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  'claude-sonnet-4-20250514': {
    label: 'Claude Sonnet 4',
    contextWindow: 1000000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-3-haiku-20240307': {
    label: 'Claude Haiku 3 (deprecated)',
    contextWindow: 200000,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
  },
  'gpt-4o': {
    label: 'GPT-4o',
    contextWindow: 128000,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  'gpt-4.1': {
    label: 'GPT-4.1',
    contextWindow: 1047576,
    costPer1kInput: 0.002,
    costPer1kOutput: 0.008,
  },
  'gpt-4o-mini': {
    label: 'GPT-4o mini',
    contextWindow: 128000,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  'gpt-5-mini': {
    label: 'GPT-5 mini',
    contextWindow: 128000,
    costPer1kInput: 0.0011,
    costPer1kOutput: 0.0044,
  },
  'o3': {
    label: 'o3',
    contextWindow: 200000,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.04,
  },
  'o3-mini': {
    label: 'o3-mini',
    contextWindow: 200000,
    costPer1kInput: 0.0011,
    costPer1kOutput: 0.0044,
  },
  'o1': {
    label: 'o1',
    contextWindow: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
  },
  'codex-1': {
    label: 'Codex 1',
    contextWindow: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.012,
  },
};

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.7,
};

export const ORCHESTRATOR_MODEL_CONFIG: ModelConfig = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.4,
};
