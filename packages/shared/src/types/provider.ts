/**
 * Pluggable LLM provider types.
 *
 * Built-in providers (anthropic/openai/gemini) ship with the app and read their keys
 * from Settings/env. Custom providers are user-defined and stored in the DB; they let
 * users plug in DeepSeek, local Ollama/LM Studio/vLLM, Groq, OpenRouter, or any
 * OpenAI-/Anthropic-compatible endpoint by giving a base URL + (optional) API key + models.
 */

export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openai-compatible'
  | 'anthropic-compatible';

/** A single model exposed by a provider. Pricing fields drive cost measurement. */
export interface LLMModelDef {
  id: string;
  label: string;
  contextWindow?: number;
  /** USD per 1K input tokens. Omit/0 → free (e.g. local). */
  costPer1kInput?: number;
  /** USD per 1K output tokens. */
  costPer1kOutput?: number;
}

export interface LLMProvider {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Base URL incl. version suffix, e.g. https://api.deepseek.com/v1 or http://localhost:11434/v1. */
  baseUrl?: string;
  /** Stored server-side; masked on read. Optional (local servers need no key). */
  apiKey?: string;
  models: LLMModelDef[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderInput {
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  models: LLMModelDef[];
  enabled?: boolean;
}

export interface UpdateProviderInput {
  label?: string;
  kind?: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  models?: LLMModelDef[];
  enabled?: boolean;
}

/** A prefillable template for a well-known provider (shown in the UI "add provider" dialog). */
export interface ProviderPreset {
  key: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Whether this provider needs an API key (false for purely-local servers). */
  needsApiKey: boolean;
  models: LLMModelDef[];
}
