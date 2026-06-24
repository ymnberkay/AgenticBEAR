/**
 * Cost-layer choke-point.
 *
 * Every LLM call (any provider) goes through here:
 *   Request
 *     └─[L1] Semantic Cache  ──hit──> return cached answer (no LLM)
 *           │ miss
 *           └─[L2] Router  ──> pick model (cheap | main)   [Anthropic family only]
 *                 └─[L3] Prompt Caching on the chosen model [Anthropic family only]
 *                       └─ write to L1, record metrics
 *
 * L2/L3 apply only to the Anthropic family (prompt-cache + Haiku router are Anthropic
 * features). All providers get L1 + metrics, and **cost is measured for all of them**
 * via the pricing carried on the request (built-in CLAUDE_MODELS or custom provider price).
 */
import { CLAUDE_MODELS } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';
import { costConfig, isAnthropicModel } from './config.js';
import { costMetrics } from './metrics.js';
import { actualCallCost, baselineCallCost, type Pricing } from './pricing.js';
import { modelPricing } from '../llm/provider-registry.js';
import type { LlmRequest, LlmResult, MiddlewareDeps } from './types.js';
import * as semanticCache from './layers/semantic-cache.js';
import * as router from './layers/router.js';
import * as promptCache from './layers/prompt-cache.js';
import * as compression from './layers/compression.js';

const log = createLogger('cost');

const ZERO_PRICING: Pricing = { costPer1kInput: 0, costPer1kOutput: 0 };

/** Pricing for a known built-in model, or undefined. */
function knownPricing(model: string): Pricing | undefined {
  const m = CLAUDE_MODELS[model];
  return m ? { costPer1kInput: m.costPer1kInput, costPer1kOutput: m.costPer1kOutput } : undefined;
}

/**
 * Served model (potansiyel router downgrade'i sonrası) için pricing:
 *   1) İstenen ve servis edilen aynı ise → requestedPricing'i kullan
 *   2) Built-in Anthropic catalog → CLAUDE_MODELS
 *   3) Aynı provider'ın diğer modeli → modelPricing(providerId, servedModel)
 *   4) Bilinmiyor → requestedPricing fallback
 */
async function resolveServedPricing(
  servedModel: string,
  requestedModel: string,
  requestedPricing: Pricing,
  providerId: string | undefined,
): Promise<Pricing> {
  if (servedModel === requestedModel) return requestedPricing;
  const builtin = knownPricing(servedModel);
  if (builtin) return builtin;
  const lookup = await modelPricing(providerId, servedModel);
  if (lookup.costPer1kInput > 0 || lookup.costPer1kOutput > 0) return lookup;
  return requestedPricing;
}

/** Is this request the Anthropic family? Prefer the resolved kind; fall back to id heuristic. */
function isAnthropicFamily(req: LlmRequest): boolean {
  if (req.providerKind) return req.providerKind === 'anthropic' || req.providerKind === 'anthropic-compatible';
  return isAnthropicModel(req.model);
}

export async function complete(
  req: LlmRequest,
  deps: MiddlewareDeps,
  onChunk?: (chunk: string) => void,
): Promise<LlmResult> {
  const { executor, classify } = deps;

  // ── L0: Context Compression (deterministic; before everything else) ──
  let compressionSavedTokens = 0;
  if (costConfig.layers.compression && compression.isCompressible(req)) {
    try {
      const c = compression.compress(req);
      req = c.req;
      compressionSavedTokens = Math.max(0, c.originalTokens - c.compressedTokens);
    } catch (err) {
      log.warn('Compression failed, skipping L0', err);
    }
  }

  const requestedModel = req.model;
  const anthropic = isAnthropicFamily(req);
  const requestedPricing: Pricing = req.pricing ?? knownPricing(requestedModel) ?? ZERO_PRICING;

  // ── L1: Semantic Cache (judge gate uses the same cheap classifier) ──
  if (costConfig.layers.semanticCache && semanticCache.isCacheable(req)) {
    try {
      const hit = await semanticCache.lookup(req, classify);
      if (hit) {
        if (onChunk && hit.text) onChunk(hit.text);
        const baselineCostUsd = baselineCallCost(requestedPricing, {
          inputTokens: hit.baselineInputTokens ?? 0,
          outputTokens: hit.baselineOutputTokens ?? 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        });
        // Cache hit → actual cost = 0, baseline = what the call would have cost.
        const enriched: LlmResult = {
          ...hit,
          actualCostUsd: 0,
          baselineCostUsd,
          compressionSavedTokens,
        };
        recordHit(req, requestedModel, baselineCostUsd, enriched, compressionSavedTokens);
        return enriched;
      }
    } catch (err) {
      // Dayanıklılık: cache erişilemezse sessizce L2'ye düş.
      log.warn('Semantic cache lookup failed, skipping L1', err);
    }
  }

  // ── L2: Router (provider-agnostic — desteklenen family yoksa router.decide() pas geçer) ──
  let servedModel = requestedModel;
  let servedProviderId = req.providerId;
  let servedMaxTokens = req.maxTokens;
  let routerTier = null as LlmResult['routerTier'];
  let routerOverheadTokens = 0;
  let routerOverheadCostUsd = 0;

  if (costConfig.layers.router && router.isRoutable(req)) {
    try {
      const decision = await router.decide(req, classify);
      servedModel = decision.model;
      servedProviderId = decision.providerId;
      servedMaxTokens = decision.maxTokens;
      routerTier = decision.tier;
      routerOverheadTokens = decision.overheadTokens;
      routerOverheadCostUsd = decision.overheadCostUsd;
    } catch (err) {
      // Asla riskli downgrade yapma — hata olursa istenen modelde kal.
      log.warn('Router decision failed, keeping requested model', err);
    }
  }

  // ── L3: Prompt Caching (Anthropic family only; not when the router changed providers) ──
  const usePromptCache = costConfig.layers.promptCache && anthropic && servedProviderId === req.providerId;
  const finalReq = usePromptCache
    ? { ...promptCache.apply(req, { model: servedModel, maxTokens: servedMaxTokens }), providerId: servedProviderId }
    : {
        model: servedModel,
        providerId: servedProviderId,
        maxTokens: servedMaxTokens,
        temperature: req.temperature,
        systemPrompt: req.systemPrompt,
        messages: req.messages,
        stopSequences: req.stopSequences,
      };
  const promptCacheApplied = finalReq.systemBlocks !== undefined;

  // ── Gerçek çağrı ────────────────────────────────────────────────────
  const exec = await executor(finalReq, onChunk);

  // ── Maliyet hesabı ──────────────────────────────────────────────────
  // Served model, requested'dan farklıysa (router downgrade) o modelin gerçek pricing'i.
  const servedPricing = await resolveServedPricing(servedModel, requestedModel, requestedPricing, servedProviderId);
  // OpenAI/Azure bill cached prompt tokens at ~50%; Anthropic at ~10% (config default).
  const cacheReadMultiplier = isAnthropicFamily(req) ? costConfig.pricing.cacheReadMultiplier : 0.5;
  const actualCostUsd = actualCallCost(servedPricing, exec, cacheReadMultiplier) + routerOverheadCostUsd;
  const baselineCostUsd = baselineCallCost(requestedPricing, exec);

  const result: LlmResult = {
    ...exec,
    requestedModel,
    servedModel,
    cacheHit: false,
    routerTier,
    actualCostUsd,
    baselineCostUsd,
    compressionSavedTokens,
  };

  // ── L1'e yaz ────────────────────────────────────────────────────────
  if (costConfig.layers.semanticCache && semanticCache.isCacheable(req)) {
    try {
      await semanticCache.store(req, result);
    } catch (err) {
      log.warn('Semantic cache store failed', err);
    }
  }

  // ── Metrikler ───────────────────────────────────────────────────────
  costMetrics.record({
    ts: new Date().toISOString(),
    role: req.meta.role,
    requestedModel,
    servedModel,
    cacheHit: false,
    routerTier,
    promptCacheApplied,
    inputTokens: exec.inputTokens,
    outputTokens: exec.outputTokens,
    cacheReadInputTokens: exec.cacheReadInputTokens,
    cacheCreationInputTokens: exec.cacheCreationInputTokens,
    routerOverheadTokens,
    compressionSavedTokens,
    actualCostUsd,
    baselineCostUsd,
  });

  return result;
}

function recordHit(
  req: LlmRequest,
  requestedModel: LlmResult['requestedModel'],
  baselineCostUsd: number,
  hit: LlmResult,
  compressionSavedTokens: number,
): void {
  // Cache hit → no LLM call, actual cost 0; baseline = what this call would have cost.
  costMetrics.record({
    ts: new Date().toISOString(),
    role: req.meta.role,
    requestedModel,
    servedModel: hit.servedModel,
    cacheHit: true,
    routerTier: null,
    promptCacheApplied: false,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    routerOverheadTokens: 0,
    compressionSavedTokens,
    actualCostUsd: 0,
    baselineCostUsd,
  });
}

export const costMiddleware = { complete };
