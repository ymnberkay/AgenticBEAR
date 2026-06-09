import type { ProviderPreset } from '../types/provider.js';

/** Built-in provider ids (keys live in Settings/env, not the providers table). */
export const BUILTIN_PROVIDER_IDS = ['anthropic', 'openai', 'gemini'] as const;
export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[number];

export function isBuiltinProviderId(id: string): id is BuiltinProviderId {
  return (BUILTIN_PROVIDER_IDS as readonly string[]).includes(id);
}

/**
 * Prefillable templates for well-known custom providers. Prices are USD per 1K tokens
 * (current public list prices; user can edit). Used by the "add provider" dialog so the
 * user gets working base URL + models + pricing without looking them up.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    needsApiKey: true,
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', contextWindow: 64000, costPer1kInput: 0.00027, costPer1kOutput: 0.0011 },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', contextWindow: 64000, costPer1kInput: 0.00055, costPer1kOutput: 0.00219 },
    ],
  },
  {
    key: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsApiKey: true,
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', contextWindow: 128000, costPer1kInput: 0.00059, costPer1kOutput: 0.00079 },
    ],
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsApiKey: true,
    models: [],
  },
  {
    key: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    needsApiKey: false,
    models: [
      { id: 'llama3.1:8b', label: 'Llama 3.1 8B (local)', contextWindow: 128000, costPer1kInput: 0, costPer1kOutput: 0 },
    ],
  },
  {
    key: 'lmstudio',
    label: 'LM Studio (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    needsApiKey: false,
    models: [],
  },
];
