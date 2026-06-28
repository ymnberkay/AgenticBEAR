/**
 * Tool-aware completion — adds function-calling (tool-use) on top of the unified client.
 * Normalizes Anthropic (tool_use/tool_result content blocks) and OpenAI-compatible
 * (tools / tool_calls / role:'tool') into one shape so the agent loop is provider-agnostic.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ProviderKind } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';
import {
  resolveProvider,
  anthropicClientOptions,
  applyOpenAiAuthHeaders,
  type ResolvedProvider,
} from './provider-registry.js';
import { acquire, modelTimeoutMs } from '../services/rate-limiter.service.js';
import { limiterKey } from './client.js';
import { compressLossless } from '../cost/layers/compression.js';
import { costConfig } from '../cost/config.js';
import { scanAndRedact, dlpActiveForModel } from '../security/dlp.js';

const log = createLogger('llm:tools');

/** JSON-schema tool definition exposed to the model. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Normalized conversation turn (provider-agnostic). */
export interface ChatTurn {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  /** assistant turn — model requested these tools. */
  toolCalls?: ToolCall[];
  /** tool turn — result for a prior tool call. */
  toolCallId?: string;
}

export interface ToolCompletionRequest {
  providerId?: string | null;
  model: string;
  maxTokens: number;
  temperature?: number;
  systemPrompt?: string;
  messages: ChatTurn[];
}

export interface ToolCompletionResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  providerKind: ProviderKind;
  /** L0 input tokens saved by lossless compression of the messages (for cost analytics). */
  compressionSavedTokens: number;
}

/** L0 compression for the tool-use path: lossless-shrink message content before sending. */
function compressTurns(turns: ChatTurn[]): { turns: ChatTurn[]; savedTokens: number } {
  let savedTokens = 0;
  const out = turns.map((t) => {
    if (!t.content) return t;
    const c = compressLossless(t.content);
    if (c.savedTokens <= 0) return t;
    savedTokens += c.savedTokens;
    return { ...t, content: c.text };
  });
  return { turns: out, savedTokens };
}

export async function completeWithTools(req: ToolCompletionRequest, tools: ToolDef[]): Promise<ToolCompletionResult> {
  const provider = await resolveProvider(req.providerId, req.model);
  log.info(`tool call — model: ${req.model}, provider: ${provider.label} (${provider.kind}), tools: ${tools.length}`);

  // L0 — tool-use bypasses the cost middleware (side effects), but lossless compression is safe.
  const { turns, savedTokens } = compressTurns(req.messages);
  // DLP — redact (or block) secrets/PII in system + messages before they leave to the provider.
  const guarded = await applyDlp(req.systemPrompt, turns, req.model);
  const cReq = { ...req, systemPrompt: guarded.systemPrompt, messages: guarded.turns };

  // Per-model rate limit + send timeout (same limits as the non-tool path).
  const key = limiterKey(req.providerId, req.model);
  const release = await acquire(key);
  const timeoutMs = await modelTimeoutMs(key);
  try {
    const result = provider.kind === 'anthropic' || provider.kind === 'anthropic-compatible'
      ? await callAnthropicTools(cReq, provider, tools, timeoutMs)
      : await callOpenAITools(cReq, provider, tools, timeoutMs);
    return { ...result, compressionSavedTokens: savedTokens };
  } finally {
    release();
  }
}

/** DLP egress guard for the agentic path — same scanner/policy as the gateway. */
async function applyDlp(systemPrompt: string | undefined, turns: ChatTurn[], model: string): Promise<{ systemPrompt?: string; turns: ChatTurn[] }> {
  if (!(await dlpActiveForModel(model))) return { systemPrompt, turns };
  const types = new Set<string>();
  let redacted = 0;
  const guard = async (s: string | undefined): Promise<string | undefined> => {
    if (!s) return s;
    const r = await scanAndRedact(s);
    if (r.total > 0) { redacted += r.total; Object.keys(r.findings).forEach((t) => types.add(t)); }
    return r.text;
  };
  const sp = await guard(systemPrompt);
  const out = await Promise.all(turns.map(async (t) => (t.content ? { ...t, content: (await guard(t.content)) ?? t.content } : t)));
  if (redacted > 0) {
    if (costConfig.dlp.block) throw new Error(`DLP: sensitive data blocked (${[...types].join(', ')})`);
    log.info(`DLP redacted ${redacted} item(s) [${[...types].join(', ')}] in agentic egress`);
  }
  return { systemPrompt: sp, turns: out };
}

// ── Anthropic ──────────────────────────────────────────────────────────────────
function toAnthropicMessages(turns: ChatTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let i = 0;
  while (i < turns.length) {
    const t = turns[i];
    if (t.role === 'user') {
      out.push({ role: 'user', content: t.content ?? '' });
      i++;
    } else if (t.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (t.content) blocks.push({ type: 'text', text: t.content });
      for (const tc of t.toolCalls ?? []) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      out.push({ role: 'assistant', content: blocks.length ? blocks : (t.content ?? '') });
      i++;
    } else {
      // Group consecutive tool results into a single user message (Anthropic requirement).
      const results: Anthropic.ToolResultBlockParam[] = [];
      while (i < turns.length && turns[i].role === 'tool') {
        results.push({ type: 'tool_result', tool_use_id: turns[i].toolCallId ?? '', content: turns[i].content ?? '' });
        i++;
      }
      out.push({ role: 'user', content: results });
    }
  }
  return out;
}

type ProviderToolResult = Omit<ToolCompletionResult, 'compressionSavedTokens'>;

async function callAnthropicTools(req: ToolCompletionRequest, provider: ResolvedProvider, tools: ToolDef[], timeoutMs?: number): Promise<ProviderToolResult> {
  if (!provider.apiKey) throw new Error(`Anthropic API key yok (${provider.label})`);
  const client = new Anthropic(anthropicClientOptions(provider));

  const res = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    system: req.systemPrompt,
    messages: toAnthropicMessages(req.messages),
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })),
  }, timeoutMs ? { timeout: timeoutMs } : undefined);

  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of res.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: (block.input ?? {}) as Record<string, unknown> });
  }
  return {
    text,
    toolCalls,
    stopReason: res.stop_reason,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    providerKind: provider.kind,
  };
}

// ── OpenAI-compatible ───────────────────────────────────────────────────────────
function chatCompletionsUrl(base: string): string {
  try {
    const u = new URL(base);
    u.pathname = `${u.pathname.replace(/\/+$/, '')}/chat/completions`;
    return u.toString();
  } catch {
    return `${base.replace(/\/$/, '')}/chat/completions`;
  }
}

interface OAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

function toOpenAIMessages(systemPrompt: string | undefined, turns: ChatTurn[]): OAIMessage[] {
  const out: OAIMessage[] = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });
  for (const t of turns) {
    if (t.role === 'tool') {
      out.push({ role: 'tool', content: t.content ?? '', tool_call_id: t.toolCallId });
    } else if (t.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: t.content ?? null,
        ...(t.toolCalls && t.toolCalls.length
          ? { tool_calls: t.toolCalls.map((tc) => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: JSON.stringify(tc.args) } })) }
          : {}),
      });
    } else {
      out.push({ role: 'user', content: t.content ?? '' });
    }
  }
  return out;
}

async function callOpenAITools(req: ToolCompletionRequest, provider: ResolvedProvider, tools: ToolDef[], timeoutMs?: number): Promise<ProviderToolResult> {
  const url = chatCompletionsUrl(provider.baseUrl || 'https://api.openai.com/v1');
  const body: Record<string, unknown> = {
    model: req.model,
    messages: toOpenAIMessages(req.systemPrompt, req.messages),
    tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: 'auto',
    max_completion_tokens: req.maxTokens,
  };
  if (!/^o\d/.test(req.model) && req.temperature !== undefined) body.temperature = req.temperature;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  applyOpenAiAuthHeaders(provider, headers);

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
  if (!res.ok) throw new Error(`${provider.label} API hatası (${res.status}): ${await res.text()}`);

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const msg = data.choices[0]?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* keep {} */ }
    return { id: tc.id, name: tc.function.name, args };
  });
  return {
    text: msg?.content ?? '',
    toolCalls,
    stopReason: data.choices[0]?.finish_reason ?? null,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    providerKind: provider.kind,
  };
}
