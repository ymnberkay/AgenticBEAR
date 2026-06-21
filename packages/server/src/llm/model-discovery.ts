/**
 * Live model discovery — fetches the actually-available model ids from a provider's
 * own catalog endpoint (Anthropic/OpenAI/Gemini `GET /models`), using the configured key.
 * Results are cached briefly. On any failure we return the cached/empty list so the
 * catalog never breaks (callers fall back to the static MODEL_GROUPS).
 */
import type { ProviderKind } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('llm:discover');

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;
const cache = new Map<string, { ts: number; ids: string[] }>();

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchAnthropic(baseUrl: string | undefined, apiKey: string): Promise<string[]> {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const data = (await fetchJson(`${base}/v1/models?limit=1000`, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  })) as { data?: Array<{ id: string }> };
  return (data.data ?? []).map((m) => m.id);
}

async function fetchOpenAI(baseUrl: string | undefined, apiKey: string): Promise<string[]> {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const data = (await fetchJson(`${base}/models`, { Authorization: `Bearer ${apiKey}` })) as {
    data?: Array<{ id: string }>;
  };
  const ids = (data.data ?? []).map((m) => m.id);
  // Built-in OpenAI returns many non-chat models; keep chat-capable text models only.
  const NON_CHAT = /(image|audio|realtime|transcribe|tts|whisper|embedding|dall-e|moderation)/i;
  return ids.filter((id) => /^(gpt-|o\d|chatgpt)/i.test(id) && !NON_CHAT.test(id));
}

async function fetchGemini(baseUrl: string | undefined, apiKey: string): Promise<string[]> {
  const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const data = (await fetchJson(`${base}/models?key=${apiKey}&pageSize=1000`, {})) as {
    models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
  };
  return (data.models ?? [])
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
}

/** Returns available model ids for a provider, or [] if unavailable. Cached for 5 min (force bypasses). */
export async function discoverModels(
  kind: ProviderKind,
  baseUrl: string | undefined,
  apiKey: string,
  force = false,
): Promise<string[]> {
  if (!apiKey) return [];
  const cacheKey = `${kind}|${baseUrl ?? ''}|${apiKey.slice(-8)}`;
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.ts < TTL_MS) return cached.ids;

  try {
    let ids: string[];
    if (kind === 'anthropic' || kind === 'anthropic-compatible') ids = await fetchAnthropic(baseUrl, apiKey);
    else if (kind === 'gemini') ids = await fetchGemini(baseUrl, apiKey);
    else ids = await fetchOpenAI(baseUrl, apiKey);
    cache.set(cacheKey, { ts: Date.now(), ids });
    return ids;
  } catch (err) {
    log.warn(`model discovery failed for ${kind}`, err);
    return cached?.ids ?? [];
  }
}
