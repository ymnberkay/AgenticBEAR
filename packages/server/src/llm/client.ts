/**
 * Unified LLM client — the single inference path for the whole app.
 *
 * Dispatches by provider kind and returns NORMALIZED usage for every provider, so cost
 * is measurable everywhere (Anthropic, OpenAI, Gemini, DeepSeek, local Ollama/LM Studio, …):
 *   - anthropic / anthropic-compatible → Anthropic SDK (baseURL configurable). Keeps
 *     cache_control (prompt caching), streaming, and usage.cache_* fields.
 *   - openai / openai-compatible       → fetch {baseUrl}/chat/completions; usage tokens.
 *   - gemini                           → fetch generateContent; usageMetadata tokens.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ProviderKind } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';
import { resolveProvider, type ResolvedProvider } from './provider-registry.js';

const log = createLogger('llm');

export interface UnifiedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UnifiedRequest {
  providerId?: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  systemPrompt?: string;
  /** L3 prompt-cache: when set, used instead of systemPrompt (Anthropic family only). */
  systemBlocks?: Anthropic.TextBlockParam[];
  messages: UnifiedMessage[];
  stopSequences?: string[];
}

export interface UnifiedResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  stopReason: string | null;
  providerKind: ProviderKind;
  servedProviderId: string;
}

export async function complete(
  req: UnifiedRequest,
  onChunk?: (chunk: string) => void,
): Promise<UnifiedResult> {
  const provider = await resolveProvider(req.providerId, req.model);
  log.info(`LLM call — model: ${req.model}, provider: ${provider.label} (${provider.kind})`);

  switch (provider.kind) {
    case 'anthropic':
    case 'anthropic-compatible':
      return callAnthropic(req, provider, onChunk);
    case 'openai':
    case 'openai-compatible':
      return callOpenAICompatible(req, provider, onChunk);
    case 'gemini':
      return callGemini(req, provider, onChunk);
    default:
      throw new Error(`Desteklenmeyen provider kind: ${provider.kind}`);
  }
}

// ── Anthropic (native + compatible) ───────────────────────────────────────────
async function callAnthropic(
  req: UnifiedRequest,
  provider: ResolvedProvider,
  onChunk?: (chunk: string) => void,
): Promise<UnifiedResult> {
  if (!provider.apiKey) throw new Error(`Anthropic API key yok (${provider.label})`);
  const client = new Anthropic({
    apiKey: provider.apiKey,
    ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
  });

  const system: Anthropic.MessageCreateParams['system'] = req.systemBlocks ?? req.systemPrompt;
  const body: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    system,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    stop_sequences: req.stopSequences,
  };

  if (onChunk) {
    const stream = client.messages.stream(body);
    let fullText = '';
    stream.on('text', (t) => {
      fullText += t;
      onChunk(t);
    });
    const final = await stream.finalMessage();
    return {
      text: fullText,
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      cacheCreationInputTokens: final.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: final.usage.cache_read_input_tokens ?? 0,
      stopReason: final.stop_reason,
      providerKind: provider.kind,
      servedProviderId: provider.providerId,
    };
  }

  const res = await client.messages.create(body);
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheCreationInputTokens: res.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: res.usage.cache_read_input_tokens ?? 0,
    stopReason: res.stop_reason,
    providerKind: provider.kind,
    servedProviderId: provider.providerId,
  };
}

/**
 * Build the chat-completions URL, preserving any query string on the base URL.
 * This lets Azure-style endpoints carry their required `?api-version=…` (e.g. a base of
 * `https://x.services.ai.azure.com/openai/v1?api-version=preview` →
 * `.../openai/v1/chat/completions?api-version=preview`).
 */
function chatCompletionsUrl(base: string): string {
  try {
    const u = new URL(base);
    u.pathname = `${u.pathname.replace(/\/+$/, '')}/chat/completions`;
    return u.toString();
  } catch {
    return `${base.replace(/\/$/, '')}/chat/completions`;
  }
}

// ── OpenAI-compatible (OpenAI, DeepSeek, Azure Foundry, Ollama, LM Studio, Groq, …) ──
async function callOpenAICompatible(
  req: UnifiedRequest,
  provider: ResolvedProvider,
  onChunk?: (chunk: string) => void,
): Promise<UnifiedResult> {
  const url = chatCompletionsUrl(provider.baseUrl || 'https://api.openai.com/v1');
  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
  for (const m of req.messages) messages.push({ role: m.role, content: m.content });

  const body: Record<string, unknown> = { model: req.model, messages };
  // o-series reasoning models reject temperature / use max_completion_tokens.
  const isOModel = /^o\d/.test(req.model);
  if (!isOModel && req.temperature !== undefined) body.temperature = req.temperature;
  body.max_completion_tokens = req.maxTokens;
  if (req.stopSequences && req.stopSequences.length > 0) body.stop = req.stopSequences;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${provider.label} API hatası (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const text = data.choices[0]?.message?.content ?? '';
  if (onChunk && text) onChunk(text);

  // OpenAI/Azure auto-cache the repeated prompt prefix and bill it cheaper, reporting it in
  // prompt_tokens_details.cached_tokens. Split it out (Anthropic convention: input = non-cached)
  // so the cost layer credits it as prompt-cache (L3) savings.
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const cached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    text,
    inputTokens: Math.max(0, promptTokens - cached),
    outputTokens: data.usage?.completion_tokens ?? 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: cached,
    stopReason: data.choices[0]?.finish_reason ?? null,
    providerKind: provider.kind,
    servedProviderId: provider.providerId,
  };
}

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini(
  req: UnifiedRequest,
  provider: ResolvedProvider,
  onChunk?: (chunk: string) => void,
): Promise<UnifiedResult> {
  if (!provider.apiKey) throw new Error(`Gemini API key yok (${provider.label})`);
  const base = (provider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const url = `${base}/models/${req.model}:generateContent?key=${provider.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(req.systemPrompt ? { system_instruction: { parts: [{ text: req.systemPrompt }] } } : {}),
      contents: req.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        maxOutputTokens: req.maxTokens,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`${provider.label} API hatası (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (onChunk && text) onChunk(text);

  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    stopReason: data.candidates?.[0]?.finishReason ?? null,
    providerKind: provider.kind,
    servedProviderId: provider.providerId,
  };
}
