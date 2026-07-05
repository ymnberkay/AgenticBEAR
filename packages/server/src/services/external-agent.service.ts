/**
 * External agent proxy — chat requests routed to a team-built HTTP endpoint.
 *
 * Wire shape (v1): OpenAI-compatible `/v1/chat/completions`.
 *   Request:  { model, messages: [...], stream: true|false }
 *   Response: sync JSON `{ choices: [{ message: { content } }] }`
 *             OR SSE stream `data: { choices: [{ delta: { content } }] }\n\n` frames
 *
 * Image support piggy-backs on the OpenAI multimodal shape:
 *   { role, content: [ { type: 'text', text }, { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } } ] }
 *
 * Never logs the auth secret. Passes prompts through `redactEgress` before sending so DLP still
 * applies to third-party endpoints — the team's endpoint gets `[REDACTED:*]` markers for anything
 * that would have leaked.
 */
import type { Agent, ExternalAgentAuthType } from '@subagent/shared';
import { redactEgress } from '../security/dlp.js';
import { assertPublicHttpUrl } from '../security/ssrf.js';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('external-agent');

export type ExternalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }
  | { type: 'video_url'; video_url: { url: string } };

export interface ExternalMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ExternalContentPart[];
}

export interface ExternalCallRequest {
  agent: Agent & { externalSecret?: string };
  messages: ExternalMessage[];
  systemPrompt?: string;
  /** True → we ask the endpoint to stream; false → single JSON body reply. */
  wantStream: boolean;
  /** Called once per SSE token delta (or once with the full body for sync mode). */
  onDelta: (chunk: string) => void;
  /** Called once with a normalized error string when the call fails. */
  onError: (message: string) => void;
  /** Optional AbortSignal (e.g. request cancelled). */
  signal?: AbortSignal;
}

/** Build the HTTP headers, redacting the secret when the auth type is 'none'. */
function buildAuthHeaders(agent: Agent & { externalSecret?: string }): Record<string, string> {
  const secret = agent.externalSecret ?? '';
  const authType = agent.external?.authType ?? 'none';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
  if (!secret || authType === 'none') return headers;
  if (authType === 'bearer') {
    headers.Authorization = `Bearer ${secret}`;
  } else if (authType === 'header') {
    const name = (agent.external?.headerName || 'X-API-Key').trim();
    headers[name] = secret;
  }
  return headers;
}

/** Try to peel a `content` string out of anything the endpoint might send back as sync JSON. */
function extractSyncText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as Record<string, unknown>;
  // OpenAI shape
  const choices = obj.choices;
  if (Array.isArray(choices) && choices[0]) {
    const c0 = choices[0] as { message?: { content?: unknown }; text?: unknown };
    if (typeof c0.message?.content === 'string') return c0.message.content;
    if (typeof c0.text === 'string') return c0.text;
  }
  // Loose shapes some teams roll: { text }, { content }, { output }
  for (const k of ['text', 'content', 'output', 'response', 'message']) {
    const v = obj[k];
    if (typeof v === 'string') return v;
  }
  return null;
}

/**
 * Parse an SSE line stream and yield the accumulated content deltas. Compatible with the OpenAI
 * `data: {json}\n\n` framing. `[DONE]` sentinel is honored. Empty/keepalive lines skipped.
 */
async function pumpSse(response: Response, onDelta: (s: string) => void, signal?: AbortSignal): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder('utf-8');
  let buffered = '';
  while (true) {
    if (signal?.aborted) { try { await reader.cancel(); } catch { /* ignore */ } return; }
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    // Frames are separated by a blank line.
    const frames = buffered.split(/\n\n/);
    buffered = frames.pop() ?? '';
    for (const frame of frames) {
      const dataLines = frame.split('\n').filter((l) => l.startsWith('data:'));
      for (const dl of dataLines) {
        const raw = dl.slice(5).trim();
        if (!raw) continue;
        if (raw === '[DONE]') return;
        try {
          const j = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: string } }>; content?: string; text?: string };
          const delta = j.choices?.[0]?.delta?.content ?? j.content ?? j.text ?? '';
          if (delta) onDelta(delta);
        } catch {
          // Loose framing: some teams stream raw text without JSON. Forward it verbatim.
          onDelta(raw);
        }
      }
    }
  }
}

/** POST to the external endpoint and stream tokens (or resolve a single sync body) back. */
export async function callExternalAgent(req: ExternalCallRequest): Promise<void> {
  const ext = req.agent.external;
  if (!ext || !ext.endpointUrl) {
    req.onError('External agent has no endpoint URL configured.');
    return;
  }

  // SSRF guard: the endpoint URL is set by any (non-viewer) project member, so block requests to
  // loopback / private / link-local hosts (e.g. cloud metadata at 169.254.169.254) before we fetch.
  try {
    await assertPublicHttpUrl(ext.endpointUrl);
  } catch (err) {
    req.onError(err instanceof Error ? err.message : 'External agent endpoint URL is not allowed.');
    return;
  }

  // Same DLP guard as the internal chat path.
  // We only scan string content parts; image_url parts pass through untouched.
  const dlpTurns = req.messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : (m.content.find((p) => p.type === 'text')?.text ?? '') }));
  const guarded = await redactEgress({ systemPrompt: req.systemPrompt, turns: dlpTurns, model: ext.defaultModel || req.agent.name });
  // Rewrite content back into the multimodal shape.
  const sanitizedMessages: ExternalMessage[] = req.messages.map((m, i) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: guarded.turns[i]!.content ?? m.content };
    }
    // For content-part messages: replace the first text part with its redacted value.
    let replaced = false;
    const parts = m.content.map((p) => {
      if (!replaced && p.type === 'text') {
        replaced = true;
        return { type: 'text' as const, text: guarded.turns[i]!.content ?? p.text };
      }
      return p;
    });
    return { role: m.role, content: parts };
  });
  const systemPrompt = guarded.systemPrompt;

  const bodyMessages: ExternalMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...sanitizedMessages]
    : sanitizedMessages;

  const body = JSON.stringify({
    model: ext.defaultModel || req.agent.name,
    messages: bodyMessages,
    stream: req.wantStream && ext.supportsStreaming,
  });

  const headers = buildAuthHeaders(req.agent);

  let res: Response;
  try {
    res = await fetch(ext.endpointUrl, { method: 'POST', headers, body, signal: req.signal });
  } catch (err) {
    req.onError(`Cannot reach external agent: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    req.onError(`External agent returned ${res.status}: ${text}`);
    return;
  }

  const ctype = res.headers.get('content-type') ?? '';
  const isSse = ctype.includes('text/event-stream');
  if (isSse) {
    try {
      await pumpSse(res, req.onDelta, req.signal);
    } catch (err) {
      req.onError(`External agent stream error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // Sync JSON reply.
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // Some endpoints reply with plain text.
    const text = (await res.text()).trim();
    if (text) req.onDelta(text);
    else req.onError('External agent returned an empty response.');
    return;
  }
  const text = extractSyncText(json);
  if (text) {
    req.onDelta(text);
  } else {
    log.warn(`external agent ${req.agent.id} returned unrecognized JSON shape`);
    req.onError('External agent response did not contain a message. See server log for the shape.');
  }
}

export interface TestResult { ok: boolean; latencyMs: number; error?: string; sample?: string }

/** Ping the endpoint with a tiny "ping" message and capture the first reply. */
export async function testExternalAgent(agentId: string, signal?: AbortSignal): Promise<TestResult> {
  const agent = await agentRepo.findByIdWithSecret(agentId);
  if (!agent) return { ok: false, latencyMs: 0, error: 'Agent not found' };
  if (agent.role !== 'external' || !agent.external) return { ok: false, latencyMs: 0, error: 'Agent is not an external agent' };
  if (!agent.external.endpointUrl) return { ok: false, latencyMs: 0, error: 'Endpoint URL is not set' };

  let sample = '';
  let errored: string | undefined;
  const t0 = performance.now();
  await callExternalAgent({
    agent,
    messages: [{ role: 'user', content: 'ping' }],
    systemPrompt: undefined,
    wantStream: false, // sync for tests — simpler to score
    onDelta: (s) => { sample += s; },
    onError: (e) => { errored = e; },
    signal,
  });
  const latencyMs = Math.round(performance.now() - t0);
  if (errored) return { ok: false, latencyMs, error: errored };
  return { ok: true, latencyMs, sample: sample.slice(0, 200) };
}

/** Exported so unrelated callers (e.g. chat.ts) don't need to guess the auth shape. */
export const _test = { buildAuthHeaders, extractSyncText };
export type AuthKind = ExternalAgentAuthType; // re-export convenience
