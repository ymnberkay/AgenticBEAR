/**
 * Provider registry — resolves an agent's (providerId, model) to a concrete callable
 * provider (kind + base URL + API key), and looks up per-model pricing.
 *
 * Built-in providers (anthropic/openai/gemini) read keys from Settings → env.
 * Custom providers come from the llm_providers table (read fresh; no caching).
 * Legacy agents without providerId fall back to the id heuristic so old data keeps working.
 */
import { CLAUDE_MODELS, isBuiltinProviderId } from '@subagent/shared';
import type { ProviderKind } from '@subagent/shared';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { providerRepo } from '../db/repositories/provider.repo.js';

export interface ResolvedProvider {
  providerId: string;
  label: string;
  kind: ProviderKind;
  /** Base URL incl. version suffix; undefined → SDK/endpoint default. */
  baseUrl?: string;
  apiKey?: string;
}

/** Heuristic for legacy agents (no providerId): infer the built-in provider from the model id. */
export function detectBuiltinProvider(model: string): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  return 'openai';
}

function resolveBuiltinKey(provider: 'anthropic' | 'openai' | 'gemini'): string {
  const settings = settingsRepo.getSettings();
  if (provider === 'anthropic') return settings.apiKey || process.env.ANTHROPIC_API_KEY || '';
  if (provider === 'openai') return settings.openAiApiKey || process.env.OPENAI_API_KEY || '';
  return settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
}

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

export function resolveProvider(providerId: string | undefined, model: string): ResolvedProvider {
  // Built-in (explicit id) or legacy heuristic.
  if (!providerId || isBuiltinProviderId(providerId)) {
    const builtin = (providerId as 'anthropic' | 'openai' | 'gemini') ?? detectBuiltinProvider(model);
    const kind: ProviderKind = builtin;
    return {
      providerId: builtin,
      label: builtin,
      kind,
      baseUrl: builtin === 'openai' ? OPENAI_DEFAULT_BASE : undefined,
      apiKey: resolveBuiltinKey(builtin),
    };
  }

  // Custom provider from DB.
  const custom = providerRepo.findById(providerId);
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
  };
}

/** True when the resolved provider is the Anthropic family (prompt-cache + Haiku router apply). */
export function isAnthropicKind(kind: ProviderKind): boolean {
  return kind === 'anthropic' || kind === 'anthropic-compatible';
}

/** Per-model pricing ($/1K). Known built-ins → CLAUDE_MODELS; custom → provider model def; else 0. */
export function modelPricing(
  providerId: string | undefined,
  model: string,
): { costPer1kInput: number; costPer1kOutput: number } {
  const known = CLAUDE_MODELS[model];
  if (known) return { costPer1kInput: known.costPer1kInput, costPer1kOutput: known.costPer1kOutput };

  if (providerId && !isBuiltinProviderId(providerId)) {
    const custom = providerRepo.findById(providerId);
    const def = custom?.models.find((m) => m.id === model);
    if (def) return { costPer1kInput: def.costPer1kInput ?? 0, costPer1kOutput: def.costPer1kOutput ?? 0 };
  }
  return { costPer1kInput: 0, costPer1kOutput: 0 };
}
