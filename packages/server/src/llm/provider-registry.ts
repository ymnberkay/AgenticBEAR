/**
 * Provider registry — resolves an agent's (providerId, model) to a concrete callable
 * provider (kind + base URL + API key), and looks up per-model pricing.
 *
 * Built-in providers (anthropic/openai/gemini) read keys from Settings → env.
 * Custom providers come from the llm_providers table (read fresh; no caching).
 * Legacy agents without providerId fall back to the id heuristic so old data keeps working.
 */
import { CLAUDE_MODELS, isBuiltinProviderId } from '@subagent/shared';
import type { ProviderAuthType, ProviderKind } from '@subagent/shared';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { providerRepo } from '../db/repositories/provider.repo.js';

export interface ResolvedProvider {
  providerId: string;
  label: string;
  kind: ProviderKind;
  /** Base URL incl. version suffix; undefined → SDK/endpoint default. */
  baseUrl?: string;
  apiKey?: string;
  /** How the key is presented. Defaults to provider-native (`api_key`). */
  authType?: ProviderAuthType;
  /** Extra HTTP headers merged into every request (e.g. corporate gateway routing). */
  headers?: Record<string, string>;
}

/** Heuristic for legacy agents (no providerId): infer the built-in provider from the model id. */
export function detectBuiltinProvider(model: string): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  return 'openai';
}

async function resolveBuiltinKey(provider: 'anthropic' | 'openai' | 'gemini'): Promise<string> {
  const settings = await settingsRepo.getSettings();
  if (provider === 'anthropic') return settings.apiKey || process.env.ANTHROPIC_API_KEY || '';
  if (provider === 'openai') return settings.openAiApiKey || process.env.OPENAI_API_KEY || '';
  return settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
}

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

export async function resolveProvider(providerId: string | null | undefined, model: string): Promise<ResolvedProvider> {
  // Built-in (explicit id) or legacy heuristic. null = explicitly built-in (cleared custom provider).
  if (!providerId || isBuiltinProviderId(providerId)) {
    const builtin = providerId && isBuiltinProviderId(providerId) ? providerId : detectBuiltinProvider(model);
    const kind: ProviderKind = builtin;
    return {
      providerId: builtin,
      label: builtin,
      kind,
      baseUrl: builtin === 'openai' ? OPENAI_DEFAULT_BASE : undefined,
      apiKey: await resolveBuiltinKey(builtin),
    };
  }

  // Custom provider from DB.
  const custom = await providerRepo.findById(providerId);
  if (!custom) {
    throw new Error(`Provider bulunamadı: ${providerId}`);
  }
  if (custom.enabled === false) {
    throw new Error(`Provider devre dışı: ${custom.label}`);
  }
  return {
    providerId: custom.id,
    label: custom.label,
    kind: custom.kind,
    baseUrl: custom.baseUrl,
    apiKey: custom.apiKey,
    authType: custom.authType,
    headers: custom.headers,
  };
}

/** True when the resolved provider is the Anthropic family (prompt-cache + Haiku router apply). */
export function isAnthropicKind(kind: ProviderKind): boolean {
  return kind === 'anthropic' || kind === 'anthropic-compatible';
}

/**
 * Anthropic SDK constructor options for a resolved provider. Honors `authType: 'bearer'`
 * (gateways/proxies that want `Authorization: Bearer` instead of `x-api-key`) and custom headers.
 */
export function anthropicClientOptions(provider: ResolvedProvider): {
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
} {
  const opts: { apiKey?: string; authToken?: string; baseURL?: string; defaultHeaders?: Record<string, string> } = {};
  if (provider.baseUrl) opts.baseURL = provider.baseUrl;
  if (provider.authType === 'bearer') {
    // authToken → Authorization: Bearer <token>; leaving apiKey unset omits x-api-key entirely
    // so a gateway expecting only Bearer doesn't see a conflicting key header.
    opts.authToken = provider.apiKey;
  } else {
    opts.apiKey = provider.apiKey;
  }
  if (provider.headers && Object.keys(provider.headers).length > 0) opts.defaultHeaders = provider.headers;
  return opts;
}

/**
 * Apply auth + custom headers for fetch-based (OpenAI-compatible) providers. OpenAI's convention
 * is `Authorization: Bearer`; custom headers can override or add (org routing, beta flags).
 */
export function applyOpenAiAuthHeaders(provider: ResolvedProvider, headers: Record<string, string>): void {
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.headers) Object.assign(headers, provider.headers);
}

/** Per-model pricing ($/1K). Known built-ins → CLAUDE_MODELS; custom → provider model def; else 0. */
export async function modelPricing(
  providerId: string | null | undefined,
  model: string,
): Promise<{ costPer1kInput: number; costPer1kOutput: number }> {
  const known = CLAUDE_MODELS[model];
  if (known) return { costPer1kInput: known.costPer1kInput, costPer1kOutput: known.costPer1kOutput };

  if (providerId && !isBuiltinProviderId(providerId)) {
    const custom = await providerRepo.findById(providerId);
    const def = custom?.models.find((m) => m.id === model);
    if (def) return { costPer1kInput: def.costPer1kInput ?? 0, costPer1kOutput: def.costPer1kOutput ?? 0 };
  }
  return { costPer1kInput: 0, costPer1kOutput: 0 };
}
