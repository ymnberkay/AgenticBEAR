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

/**
 * How the API key is presented to the endpoint.
 * - `api_key`: provider-native (Anthropic → `x-api-key`; OpenAI-compatible → `Authorization: Bearer`).
 * - `bearer`: force `Authorization: Bearer <key>` — used by corporate LLM gateways / proxies
 *   (e.g. LiteLLM, Portkey) fronting an Anthropic-compatible endpoint.
 */
export type ProviderAuthType = 'api_key' | 'bearer';

/** A single model exposed by a provider. Pricing fields drive cost measurement. */
export interface LLMModelDef {
  id: string;
  label: string;
  contextWindow?: number;
  /** USD per 1K input tokens. Omit/0 → free (e.g. local). */
  costPer1kInput?: number;
  /** USD per 1K output tokens. */
  costPer1kOutput?: number;
  /**
   * Capability level 1–10 (weak/cheap → strong/expensive). The L2 router picks the cheapest
   * model whose level meets the request's complexity, capped at the requested model's level.
   * Omit → derived from the model name.
   */
  level?: number;
}

export interface LLMProvider {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Base URL incl. version suffix, e.g. https://api.deepseek.com/v1 or http://localhost:11434/v1. */
  baseUrl?: string;
  /** Stored server-side; masked on read. Optional (local servers need no key). */
  apiKey?: string;
  /** How the key is sent. Defaults to `api_key` (provider-native). */
  authType?: ProviderAuthType;
  /** Extra HTTP headers sent on every request (e.g. `anthropic-beta`, org routing). */
  headers?: Record<string, string>;
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
  authType?: ProviderAuthType;
  headers?: Record<string, string>;
  models: LLMModelDef[];
  enabled?: boolean;
}

export interface UpdateProviderInput {
  label?: string;
  kind?: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  authType?: ProviderAuthType;
  headers?: Record<string, string>;
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
