/**
 * OpenAI-compatible LLM gateway.
 *
 *   POST /v1/chat/completions   (stream + non-stream)
 *   GET  /v1/models             (catalog of reachable models)
 *
 * Every call is routed through ClaudeService → costMiddleware (L1/L2/L3 + metrics) →
 * the unified provider client. So any internal app pointing an OpenAI SDK at this base
 * URL is cost-optimized automatically, across all configured providers.
 */
import type { FastifyInstance } from 'fastify';
import { generateId, isBuiltinProviderId, MODEL_GROUPS, CLAUDE_MODELS, PROVIDER_SCOPE_PREFIX } from '@subagent/shared';
import type { GatewayKey } from '@subagent/shared';
import { ClaudeService, type ClaudeCallResult, type ClaudeMessage } from '../services/claude.service.js';
import type { ContentPart, MessageContent } from '../llm/content.js';
import { detectBuiltinProvider } from '../llm/provider-registry.js';
import { providerRepo } from '../db/repositories/provider.repo.js';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { gatewayUsageRepo, type GatewayStatus } from '../db/repositories/gateway-usage.repo.js';
import { discoverModels } from '../llm/model-discovery.js';
import { requireGatewayKey, type AuthedRequest } from '../middleware/require-gateway-key.js';
import { resolveGroupForKey, checkQuota, recordQuotaUsage } from '../services/quota.service.js';
import { redactEgress } from '../security/dlp.js';
import { costConfig } from '../cost/config.js';
import { createLogger } from '../utils/logger.js';
import type { FastifyRequest } from 'fastify';

const log = createLogger('gateway');

interface OpenAIContentPart {
  type?: string;
  text?: string;
  /** OpenAI vision shape — data-URI (base64) or https URL. */
  image_url?: { url?: string };
  /** Video extension used by OpenAI-compatible multimodal endpoints (Qwen, vLLM, …). */
  video_url?: { url?: string };
  /** Audio by URL (vLLM/Qwen convention) — data-URI or https URL. */
  audio_url?: { url?: string };
  /** OpenAI's official audio-in shape — base64 payload + container format ('wav', 'mp3', …). */
  input_audio?: { data?: string; format?: string };
}
interface OpenAIMessage { role: string; content: string | OpenAIContentPart[] }
interface OpenAIChatRequest {
  model?: string;
  messages?: OpenAIMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stop?: string | string[];
}

const DEFAULT_MAX_TOKENS = 4096;

/** `providerId/model` → { providerId, model } (split on first '/', only if first segment is a known provider). */
/**
 * Human-friendly, URL-safe slug for a custom provider's label ("Gemini AI Studio" → "gemini-ai-studio").
 * Used as the model-id prefix instead of the opaque provider row id so downstream apps see
 * `gemini/gemini-2.5-flash` instead of `S1BZ4o.../gemini-2.5-flash`. Collisions across providers
 * with identical slugs get a numeric suffix (`gemini`, `gemini-2`, …).
 */
function slugifyProviderLabel(label: string): string {
  const s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'provider';
}

interface SlugMaps {
  /** providerId → slug */
  idToSlug: Map<string, string>;
  /** slug → providerId */
  slugToId: Map<string, string>;
}
/** Rebuild both directions of the slug ↔ providerId map in one pass. */
async function providerSlugMaps(): Promise<SlugMaps> {
  const idToSlug = new Map<string, string>();
  const slugToId = new Map<string, string>();
  let providers: Awaited<ReturnType<typeof providerRepo.findAll>>;
  try {
    providers = await providerRepo.findAll();
  } catch {
    return { idToSlug, slugToId }; // DB not initialized (unit tests) → empty maps
  }
  const used = new Set<string>();
  for (const p of providers) {
    const base = slugifyProviderLabel(p.label || p.id);
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) { candidate = `${base}-${i}`; i++; }
    used.add(candidate);
    idToSlug.set(p.id, candidate);
    slugToId.set(candidate, p.id);
  }
  return { idToSlug, slugToId };
}

/**
 * Rewrite any model id into its canonical (slug-prefixed) shape.
 * Accepts both the legacy `<opaqueProviderId>/<model>` form and the new `<slug>/<model>` form and
 * always returns the slug form (for built-ins/unknowns it returns the input unchanged).
 * Used to compare API-key allowlists / curation entries against catalog ids without a migration.
 */
async function canonicalizeModelId(modelId: string, maps?: SlugMaps): Promise<string> {
  const slash = modelId.indexOf('/');
  if (slash === -1) return modelId;
  const first = modelId.slice(0, slash);
  const rest = modelId.slice(slash + 1);
  if (isBuiltinProviderId(first)) return modelId;
  const m = maps ?? await providerSlugMaps();
  // Already a slug we know about? Keep it.
  if (m.slugToId.has(first)) return modelId;
  // Legacy opaque id? Rewrite to slug form.
  const slug = m.idToSlug.get(first);
  if (slug) return `${slug}/${rest}`;
  return modelId;
}

export async function parseModelRef(model: string): Promise<{ providerId?: string; model: string }> {
  const slash = model.indexOf('/');
  if (slash === -1) return { model };
  const first = model.slice(0, slash);
  const rest = model.slice(slash + 1);
  if (!rest) return { model };
  if (isBuiltinProviderId(first)) return { providerId: first, model: rest };
  // Custom providers: match either the new label-slug prefix OR the legacy opaque id (backward compat
  // for API keys with allowedModels stored in the old format + external clients still using the old id).
  const maps = await providerSlugMaps();
  const pidFromSlug = maps.slugToId.get(first);
  if (pidFromSlug) return { providerId: pidFromSlug, model: rest };
  try {
    if (await providerRepo.findById(first)) return { providerId: first, model: rest };
  } catch { /* DB not initialized (unit tests) */ }
  return { model };
}

/**
 * The "owner" of a requested model — matches the catalog's `owned_by` so a parent-provider
 * scope (`owner:<provider>`) can be checked from the model id alone, without rebuilding the
 * (discovery-backed) catalog on every request.
 */
async function modelOwner(modelId: string): Promise<string> {
  const { providerId, model } = await parseModelRef(modelId);
  if (providerId) {
    if (isBuiltinProviderId(providerId)) return providerId;
    return (await providerRepo.findById(providerId))?.label ?? providerId;
  }
  return detectBuiltinProvider(model);
}

/**
 * Whether a key may call a model. Empty scope = all.
 * Both sides are canonicalized to the slug-prefixed form, so an API key created before the
 * slug switch (allowlist stored as `<opaqueId>/<model>`) still matches a request that comes
 * in as `<slug>/<model>` (or vice-versa).
 */
async function keyAllowsModel(key: GatewayKey, modelId: string): Promise<boolean> {
  if (key.allowedModels.length === 0) return true;
  const maps = await providerSlugMaps();
  const canonRequested = await canonicalizeModelId(modelId, maps);
  for (const a of key.allowedModels) {
    if (await canonicalizeModelId(a, maps) === canonRequested) return true;
  }
  const owner = await modelOwner(modelId);
  return key.allowedModels.includes(`${PROVIDER_SCOPE_PREFIX}${owner}`);
}

function partText(c: string | OpenAIContentPart[]): string {
  if (typeof c === 'string') return c;
  return (c ?? []).map((p) => p.text ?? '').join('');
}

/**
 * Normalize an OpenAI content body, KEEPING media parts (image_url/video_url) so they reach the
 * provider. Text-only bodies collapse back to a plain string (identical to the pre-media behavior).
 */
function partContent(c: string | OpenAIContentPart[]): MessageContent {
  if (typeof c === 'string') return c;
  const parts: ContentPart[] = [];
  for (const p of c ?? []) {
    if (p.type === 'image_url' && p.image_url?.url) parts.push({ type: 'image_url', image_url: { url: p.image_url.url } });
    else if (p.type === 'video_url' && p.video_url?.url) parts.push({ type: 'video_url', video_url: { url: p.video_url.url } });
    else if (p.type === 'audio_url' && p.audio_url?.url) parts.push({ type: 'audio_url', audio_url: { url: p.audio_url.url } });
    else if (p.type === 'input_audio' && p.input_audio?.data) {
      // Normalize OpenAI's {data, format} to a data-URI; the egress converts it back.
      parts.push({ type: 'audio_url', audio_url: { url: `data:audio/${p.input_audio.format || 'wav'};base64,${p.input_audio.data}` } });
    }
    else if (typeof p.text === 'string') parts.push({ type: 'text', text: p.text });
  }
  if (parts.every((p) => p.type === 'text')) return partText(c);
  return parts;
}

/** Split OpenAI messages into a system prompt + user/assistant turns (media parts preserved). */
export function splitMessages(messages: OpenAIMessage[]): { systemPrompt?: string; turns: ClaudeMessage[] } {
  const systemParts: string[] = [];
  const turns: ClaudeMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(partText(m.content));
    else if (m.role === 'user' || m.role === 'assistant') turns.push({ role: m.role, content: partContent(m.content) });
    // tool/function roles are ignored in v1
  }
  return { systemPrompt: systemParts.length ? systemParts.join('\n\n') : undefined, turns };
}

/** Anthropic/other stop reasons → OpenAI finish_reason. */
function finishReason(stop: string | null): string {
  if (stop === 'max_tokens' || stop === 'length') return 'length';
  return 'stop';
}

function oaiError(message: string, type = 'invalid_request_error', code: string | null = null) {
  return { error: { message, type, code } };
}

export interface CatalogModel {
  id: string;
  object: 'model';
  owned_by: string;
  /** Whether this model is in the curated allowlist (empty allowlist = all enabled). */
  enabled: boolean;
}

/** Static fallback list of built-in model ids for a provider family (from MODEL_GROUPS). */
function staticBuiltinModels(provider: 'anthropic' | 'openai'): string[] {
  const out: string[] = [];
  for (const group of MODEL_GROUPS) {
    const label = group.label.toLowerCase();
    if (provider === 'anthropic' && label.includes('anthropic')) out.push(...group.models);
    if (provider === 'openai' && label.includes('openai')) out.push(...group.models);
  }
  return out;
}

/**
 * Build the catalog of reachable models. Built-in providers are listed via LIVE discovery
 * from their own /models endpoint (so newest models + exactly what the key can access show
 * up), falling back to the static MODEL_GROUPS list if discovery fails. Custom providers are
 * listed as `<providerId>/<modelId>`.
 */
export async function buildModelCatalog(force = false): Promise<CatalogModel[]> {
  const settings = await settingsRepo.getSettings();
  const anthropicKey = settings.apiKey || process.env.ANTHROPIC_API_KEY || '';
  const openaiKey = settings.openAiApiKey || process.env.OPENAI_API_KEY || '';
  const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';

  const [anthropicIds, openaiIds, geminiIds] = await Promise.all([
    anthropicKey ? discoverModels('anthropic', undefined, anthropicKey, force) : Promise.resolve([]),
    openaiKey ? discoverModels('openai', undefined, openaiKey, force) : Promise.resolve([]),
    geminiKey ? discoverModels('gemini', undefined, geminiKey, force) : Promise.resolve([]),
  ]);

  const data: Array<Omit<CatalogModel, 'enabled'>> = [];
  const pushAll = (ids: string[], owned: string) => {
    for (const id of ids) data.push({ id, object: 'model', owned_by: owned });
  };

  if (anthropicKey) pushAll(anthropicIds.length ? anthropicIds : staticBuiltinModels('anthropic'), 'anthropic');
  if (openaiKey) pushAll(openaiIds.length ? openaiIds : staticBuiltinModels('openai'), 'openai');
  if (geminiKey) pushAll(geminiIds, 'gemini');

  const maps = await providerSlugMaps();
  for (const p of await providerRepo.findAll()) {
    if (!p.enabled) continue;
    const slug = maps.idToSlug.get(p.id) ?? p.id;
    for (const m of p.models) {
      data.push({ id: `${slug}/${m.id}`, object: 'model', owned_by: p.label });
    }
  }

  // Curated allowlist. When curation is on it's authoritative (a newly-added provider's models
  // start disabled); when off (never curated) everything reachable is enabled. Legacy allowlist
  // entries (opaque-id prefix) are canonicalized here so a curation snapshot taken before this
  // switch keeps working.
  const canonAllow = new Set<string>();
  for (const id of settings.enabledModels ?? []) canonAllow.add(await canonicalizeModelId(id, maps));
  const allEnabled = !settings.modelCurationEnabled && canonAllow.size === 0;
  return data.map((m) => ({ ...m, enabled: allEnabled || canonAllow.has(m.id) }));
}

/**
 * Switch to curation-first exposure, locking the CURRENT catalog in as the enabled set. Call this
 * right BEFORE a new provider's models become reachable so those new models default to disabled
 * (they're not in the snapshot) while everything already reachable stays enabled. No-op once on.
 */
export async function lockCurationToCurrentCatalog(): Promise<void> {
  const settings = await settingsRepo.getSettings();
  if (settings.modelCurationEnabled) return;
  const ids = (await buildModelCatalog()).map((m) => m.id);
  await settingsRepo.updateSettings({ modelCurationEnabled: true, enabledModels: ids });
}

function gatewayKeyId(request: FastifyRequest): string | null {
  return (request as FastifyRequest & { gatewayKeyId?: string }).gatewayKeyId ?? null;
}

/** Coarse machine-readable class for an upstream failure (drives the error-breakdown panel). */
function errorKind(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as { status?: number } | null)?.status;
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('aborted')) return 'timeout';
  if (status === 429 || msg.includes('rate limit')) return 'upstream_rate_limit';
  if ((status && status >= 500) || msg.includes('overloaded')) return 'upstream_5xx';
  if (status && status >= 400) return 'upstream_4xx';
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network') || msg.includes('fetch failed')) return 'network';
  return 'unknown';
}

/** Persist a per-call usage row for cost attribution (best-effort) + group quota pool. */
async function recordUsage(request: FastifyRequest, model: string, providerId: string | undefined, result: ClaudeCallResult, groupId: string | null, latencyMs: number): Promise<void> {
  try {
    await gatewayUsageRepo.record({
      keyId: gatewayKeyId(request),
      groupId,
      model,
      providerId: providerId ?? null,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.actualCostUsd,
      baselineUsd: result.baselineCostUsd,
      cacheHit: result.cacheHit,
      cacheKind: result.cacheHit ? result.cacheKind : null,
      routerTier: result.routerTier,
      latencyMs,
      status: 'ok',
    });
    await recordQuotaUsage(groupId, result.inputTokens, result.outputTokens, result.actualCostUsd);
  } catch (err) {
    log.warn('gateway usage record failed', err);
  }
}

/**
 * Record a non-billable outcome (error or a rejection: rate-limit / quota / model-not-allowed / DLP).
 * Zero tokens & cost — it only feeds the reliability / limit-rejection panels. Best-effort.
 */
async function recordEvent(
  request: FastifyRequest, model: string, groupId: string | null,
  status: GatewayStatus, errorType: string, latencyMs: number | null,
): Promise<void> {
  try {
    await gatewayUsageRepo.record({
      keyId: gatewayKeyId(request), groupId, model, providerId: null,
      inputTokens: 0, outputTokens: 0, costUsd: 0, baselineUsd: 0,
      cacheHit: false, routerTier: null, latencyMs, status, errorType,
    });
  } catch (err) {
    log.warn('gateway event record failed', err);
  }
}

export async function gatewayRoutes(app: FastifyInstance): Promise<void> {
  // Auth on every /v1 route in this (encapsulated) plugin.
  app.addHook('preHandler', requireGatewayKey);

  // ── Catalog ───────────────────────────────────────────────────────────────
  app.get('/v1/models', async (request, reply) => {
    // Only curated-enabled models are exposed via the gateway.
    let data = (await buildModelCatalog()).filter((m) => m.enabled);
    // A scoped key only "sees" the models it is allowed to call. Canonicalize both sides so
    // an old (opaque-id) allowlist entry matches the new (slug) catalog id.
    const key = (request as AuthedRequest).gatewayKey;
    if (key && key.allowedModels.length > 0) {
      const maps = await providerSlugMaps();
      const canonAllow = new Set(await Promise.all(key.allowedModels.map((a) => canonicalizeModelId(a, maps))));
      data = data.filter((m) => canonAllow.has(m.id) || key.allowedModels.includes(`${PROVIDER_SCOPE_PREFIX}${m.owned_by}`));
    }
    return reply.send({ object: 'list', data });
  });

  // ── Chat completions ────────────────────────────────────────────────────────
  app.post<{ Body: OpenAIChatRequest }>('/v1/chat/completions', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return reply.status(400).send(oaiError('`model` and a non-empty `messages` array are required'));
    }

    // Per-key model scope: exact id or a parent-provider (`owner:<provider>`) wildcard.
    const authedKey = (request as AuthedRequest).gatewayKey;
    const groupId = resolveGroupForKey(authedKey);
    if (authedKey && !(await keyAllowsModel(authedKey, body.model))) {
      await recordEvent(request, body.model, groupId, 'model_not_allowed', 'model_not_allowed', null);
      return reply.status(403).send(oaiError(`Model '${body.model}' is not allowed for this API key.`, 'permission_error', 'model_not_allowed'));
    }

    // Group token quota (shared monthly pool) — the key's linked group, if any.
    const quota = await checkQuota(groupId);
    if (!quota.allowed) {
      await recordEvent(request, body.model, groupId, 'quota_exceeded', 'quota', null);
      return reply.status(429).send(oaiError(
        `Monthly token quota exceeded for this key's group (${quota.used}/${quota.quota}).`,
        'insufficient_quota', 'quota_exceeded',
      ));
    }

    const { providerId, model } = await parseModelRef(body.model);
    const split = splitMessages(body.messages);
    let systemPrompt = split.systemPrompt;
    const turns = split.turns;
    if (turns.length === 0) {
      return reply.status(400).send(oaiError('at least one user/assistant message is required'));
    }

    // ── DLP egress guard — redact (or block) secrets/PII before the prompt leaves to the provider ──
    // Single shared helper with the agentic path: both call `redactEgress` so policy can never drift.
    // Media parts (image/video) pass through unscanned; every text slot — plain turns AND text parts
    // inside multimodal turns — is scanned and written back in place.
    {
      const slots: Array<{ turn: number; part: number | null }> = [];
      const dlpTurns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      turns.forEach((t, ti) => {
        if (typeof t.content === 'string') {
          slots.push({ turn: ti, part: null });
          dlpTurns.push({ role: t.role, content: t.content });
        } else {
          t.content.forEach((p, pi) => {
            if (p.type === 'text') {
              slots.push({ turn: ti, part: pi });
              dlpTurns.push({ role: t.role, content: p.text });
            }
          });
        }
      });
      const guarded = await redactEgress({ systemPrompt, turns: dlpTurns, model: body.model });
      if (guarded.redacted > 0) {
        if (costConfig.dlp.block) {
          await recordEvent(request, body.model, groupId, 'dlp_blocked', guarded.types.join(',') || 'dlp', null);
          return reply.status(422).send(oaiError(`Request blocked: sensitive data detected (${guarded.types.join(', ')})`, 'invalid_request_error', 'sensitive_data_blocked'));
        }
        reply.header('x-agb-dlp-redacted', String(guarded.redacted));
        reply.header('x-agb-dlp-types', guarded.types.join(','));
        log.info(`DLP redacted ${guarded.redacted} item(s) [${guarded.types.join(', ')}] before egress`);
      }
      systemPrompt = guarded.systemPrompt;
      slots.forEach((s, i) => {
        const next = guarded.turns[i]?.content;
        if (typeof next !== 'string') return;
        if (s.part === null) turns[s.turn]!.content = next;
        else (turns[s.turn]!.content as ContentPart[])[s.part] = { type: 'text', text: next };
      });
    }

    const maxTokens = body.max_completion_tokens ?? body.max_tokens ?? DEFAULT_MAX_TOKENS;
    const temperature = body.temperature;
    const stopSequences = body.stop === undefined ? undefined : Array.isArray(body.stop) ? body.stop : [body.stop];
    // Omitted temperature → cacheable (most chatbots don't set it). Only an EXPLICIT high
    // temperature (creative/varied output) opts out of L1 caching.
    // FAQ-mode keys cache by the last question only → repeated questions hit even as the caller's
    // conversation history grows, AND regardless of temperature (they explicitly opted into caching).
    const cacheScope = authedKey?.cacheScope ?? 'conversation';
    const cacheable = cacheScope === 'lastUser' ? true : (temperature ?? 0) <= 0.3;
    // Level-router pool = the API key's allowed models (scoped key) so the router can serve a
    // simple request from a cheaper model within what this key may call. Unscoped → provider-only.
    const routePool = authedKey && authedKey.allowedModels.length > 0 ? authedKey.allowedModels : undefined;
    const meta = { callKind: 'gateway' as const, cacheable, routePool, cacheScope };
    const service = new ClaudeService();
    const id = `chatcmpl-${generateId()}`;
    const created = Math.floor(Date.now() / 1000);

    // ── Streaming (SSE) ──────────────────────────────────────────────────────
    if (body.stream) {
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      const base = { id, object: 'chat.completion.chunk', created, model: body.model };
      send({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });

      const startedAt = Date.now();
      try {
        const result = await service.streamMessage(
          { model, providerId, maxTokens, temperature, systemPrompt, messages: turns, stopSequences, meta },
          (chunk) => send({ ...base, model: '', choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] }),
        );
        send({ ...base, model: result.servedModel, choices: [{ index: 0, delta: {}, finish_reason: finishReason(result.stopReason) }] });
        raw.write('data: [DONE]\n\n');
        raw.end();
        await recordUsage(request, body.model, providerId, result, groupId, Date.now() - startedAt);
        log.info(`gateway stream ${body.model} → ${result.servedModel} ($${result.actualCostUsd.toFixed(6)})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('gateway stream failed', err);
        await recordEvent(request, body.model, groupId, 'error', errorKind(err), Date.now() - startedAt);
        send({ error: { message: msg, type: 'api_error' } });
        raw.end();
      }
      return reply;
    }

    // ── Non-stream ───────────────────────────────────────────────────────────
    const startedAt = Date.now();
    try {
      const result = await service.sendMessage({
        model, providerId, maxTokens, temperature, systemPrompt, messages: turns, stopSequences, meta,
      });

      reply.headers({
        'x-agb-served-model': result.servedModel,
        'x-agb-cost-usd': String(result.actualCostUsd),
        'x-agb-baseline-usd': String(result.baselineCostUsd),
        'x-agb-cache-hit': String(result.cacheHit),
      });
      await recordUsage(request, body.model, providerId, result, groupId, Date.now() - startedAt);

      return reply.send({
        id,
        object: 'chat.completion',
        created,
        model: result.servedModel,
        choices: [
          { index: 0, message: { role: 'assistant', content: result.text }, finish_reason: finishReason(result.stopReason) },
        ],
        usage: {
          prompt_tokens: result.inputTokens,
          completion_tokens: result.outputTokens,
          total_tokens: result.inputTokens + result.outputTokens,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('gateway completion failed', err);
      await recordEvent(request, body.model, groupId, 'error', errorKind(err), Date.now() - startedAt);
      return reply.status(502).send(oaiError(msg, 'api_error'));
    }
  });
}
