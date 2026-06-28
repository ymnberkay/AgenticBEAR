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
import { detectBuiltinProvider } from '../llm/provider-registry.js';
import { providerRepo } from '../db/repositories/provider.repo.js';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { gatewayUsageRepo } from '../db/repositories/gateway-usage.repo.js';
import { discoverModels } from '../llm/model-discovery.js';
import { requireGatewayKey, type AuthedRequest } from '../middleware/require-gateway-key.js';
import { resolveGroupForKey, checkQuota, recordQuotaUsage } from '../services/quota.service.js';
import { scanAndRedact, dlpActiveForModel } from '../security/dlp.js';
import { costConfig } from '../cost/config.js';
import { createLogger } from '../utils/logger.js';
import type { FastifyRequest } from 'fastify';

const log = createLogger('gateway');

interface OpenAIContentPart { type?: string; text?: string }
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
export async function parseModelRef(model: string): Promise<{ providerId?: string; model: string }> {
  const slash = model.indexOf('/');
  if (slash === -1) return { model };
  const first = model.slice(0, slash);
  const rest = model.slice(slash + 1);
  if (rest && (isBuiltinProviderId(first) || (await providerRepo.findById(first)))) {
    return { providerId: first, model: rest };
  }
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

/** Whether a key may call a model: empty scope = all; else exact id OR a parent `owner:` wildcard. */
async function keyAllowsModel(key: GatewayKey, modelId: string): Promise<boolean> {
  if (key.allowedModels.length === 0) return true;
  if (key.allowedModels.includes(modelId)) return true;
  return key.allowedModels.includes(`${PROVIDER_SCOPE_PREFIX}${await modelOwner(modelId)}`);
}

function partText(c: string | OpenAIContentPart[]): string {
  if (typeof c === 'string') return c;
  return (c ?? []).map((p) => p.text ?? '').join('');
}

/** Split OpenAI messages into a system prompt + user/assistant turns. */
function splitMessages(messages: OpenAIMessage[]): { systemPrompt?: string; turns: ClaudeMessage[] } {
  const systemParts: string[] = [];
  const turns: ClaudeMessage[] = [];
  for (const m of messages) {
    const text = partText(m.content);
    if (m.role === 'system') systemParts.push(text);
    else if (m.role === 'user' || m.role === 'assistant') turns.push({ role: m.role, content: text });
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

  const data: CatalogModel[] = [];
  const pushAll = (ids: string[], owned: string) => {
    for (const id of ids) data.push({ id, object: 'model', owned_by: owned });
  };

  if (anthropicKey) pushAll(anthropicIds.length ? anthropicIds : staticBuiltinModels('anthropic'), 'anthropic');
  if (openaiKey) pushAll(openaiIds.length ? openaiIds : staticBuiltinModels('openai'), 'openai');
  if (geminiKey) pushAll(geminiIds, 'gemini');

  for (const p of await providerRepo.findAll()) {
    if (!p.enabled) continue;
    for (const m of p.models) {
      data.push({ id: `${p.id}/${m.id}`, object: 'model', owned_by: p.label });
    }
  }
  return data;
}

function gatewayKeyId(request: FastifyRequest): string | null {
  return (request as FastifyRequest & { gatewayKeyId?: string }).gatewayKeyId ?? null;
}

/** Persist a per-call usage row for cost attribution (best-effort) + group quota pool. */
async function recordUsage(request: FastifyRequest, model: string, providerId: string | undefined, result: ClaudeCallResult, groupId: string | null): Promise<void> {
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
      routerTier: result.routerTier,
    });
    await recordQuotaUsage(groupId, result.inputTokens, result.outputTokens, result.actualCostUsd);
  } catch (err) {
    log.warn('gateway usage record failed', err);
  }
}

export async function gatewayRoutes(app: FastifyInstance): Promise<void> {
  // Auth on every /v1 route in this (encapsulated) plugin.
  app.addHook('preHandler', requireGatewayKey);

  // ── Catalog ───────────────────────────────────────────────────────────────
  app.get('/v1/models', async (request, reply) => {
    let data = await buildModelCatalog();
    // A scoped key only "sees" the models it is allowed to call.
    const key = (request as AuthedRequest).gatewayKey;
    if (key && key.allowedModels.length > 0) {
      const allow = new Set(key.allowedModels);
      data = data.filter((m) => allow.has(m.id) || allow.has(`${PROVIDER_SCOPE_PREFIX}${m.owned_by}`));
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
    if (authedKey && !(await keyAllowsModel(authedKey, body.model))) {
      return reply.status(403).send(oaiError(`Model '${body.model}' is not allowed for this API key.`, 'permission_error', 'model_not_allowed'));
    }

    // Group token quota (shared monthly pool) — the key's linked group, if any.
    const groupId = resolveGroupForKey(authedKey);
    const quota = await checkQuota(groupId);
    if (!quota.allowed) {
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
    if (await dlpActiveForModel(body.model)) {
      const types = new Set<string>();
      let redacted = 0;
      const guard = async (s: string | undefined): Promise<string | undefined> => {
        if (!s) return s;
        const r = await scanAndRedact(s);
        if (r.total > 0) { redacted += r.total; Object.keys(r.findings).forEach((t) => types.add(t)); }
        return r.text;
      };
      systemPrompt = await guard(systemPrompt);
      for (const t of turns) t.content = (await guard(t.content)) ?? t.content;
      if (redacted > 0) {
        if (costConfig.dlp.block) {
          return reply.status(422).send(oaiError(`Request blocked: sensitive data detected (${[...types].join(', ')})`, 'invalid_request_error', 'sensitive_data_blocked'));
        }
        reply.header('x-agb-dlp-redacted', String(redacted));
        log.info(`DLP redacted ${redacted} item(s) [${[...types].join(', ')}] before egress`);
      }
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

      try {
        const result = await service.streamMessage(
          { model, providerId, maxTokens, temperature, systemPrompt, messages: turns, stopSequences, meta },
          (chunk) => send({ ...base, model: '', choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] }),
        );
        send({ ...base, model: result.servedModel, choices: [{ index: 0, delta: {}, finish_reason: finishReason(result.stopReason) }] });
        raw.write('data: [DONE]\n\n');
        raw.end();
        await recordUsage(request, body.model, providerId, result, groupId);
        log.info(`gateway stream ${body.model} → ${result.servedModel} ($${result.actualCostUsd.toFixed(6)})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('gateway stream failed', err);
        send({ error: { message: msg, type: 'api_error' } });
        raw.end();
      }
      return reply;
    }

    // ── Non-stream ───────────────────────────────────────────────────────────
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
      await recordUsage(request, body.model, providerId, result, groupId);

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
      return reply.status(502).send(oaiError(msg, 'api_error'));
    }
  });
}
