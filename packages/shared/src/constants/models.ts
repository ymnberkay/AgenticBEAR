import type { ClaudeModel, ModelConfig } from '../types/agent.js';

export const CLAUDE_MODELS: Record<ClaudeModel, { label: string; contextWindow: number; costPer1kInput: number; costPer1kOutput: number }> = {
  'claude-opus-4-20250514': {
    label: 'Claude Opus 4',
    contextWindow: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
  },
  'claude-sonnet-4-20250514': {
    label: 'Claude Sonnet 4',
    contextWindow: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'claude-haiku-4-5-20251001': {
    label: 'Claude Haiku 4.5',
    contextWindow: 200000,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
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
