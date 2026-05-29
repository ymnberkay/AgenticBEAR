/**
 * Cost-layer choke-point.
 *
 * Tüm Anthropic LLM çağrıları buradan geçer:
 *   İstek
 *     └─[L1] Semantic Cache  ──hit──> cevabı döndür (LLM yok)
 *           │ miss
 *           └─[L2] Router  ──> model seç (cheap | main)
 *                 └─[L3] Prompt Caching ile seçilen modele çağrı (executor)
 *                       └─ cevabı L1'e yaz, metrikleri kaydet
 *
 * Her katman config flag'i ile atlanabilir. Üçü de kapalıyken (veya skeleton
 * implementasyonlarda) executor istenen istekle BİREBİR aynı çağrıyı yapar.
 */
import { createLogger } from '../utils/logger.js';
import { costConfig, isAnthropicModel } from './config.js';
import { costMetrics } from './metrics.js';
import { actualCallCost, baselineCallCost } from './pricing.js';
import type { LlmRequest, LlmResult, MiddlewareDeps } from './types.js';
import * as semanticCache from './layers/semantic-cache.js';
import * as router from './layers/router.js';
import * as promptCache from './layers/prompt-cache.js';

const log = createLogger('cost');

export async function complete(
  req: LlmRequest,
  deps: MiddlewareDeps,
  onChunk?: (chunk: string) => void,
): Promise<LlmResult> {
  const { executor, classify } = deps;
  const requestedModel = req.model;
  const anthropic = isAnthropicModel(requestedModel);

  // ── L1: Semantic Cache ──────────────────────────────────────────────
  if (costConfig.layers.semanticCache && semanticCache.isCacheable(req)) {
    try {
      const hit = await semanticCache.lookup(req);
      if (hit) {
        if (onChunk && hit.text) onChunk(hit.text);
        recordHit(req, requestedModel, hit);
        return hit;
      }
    } catch (err) {
      // Dayanıklılık: cache erişilemezse sessizce L2'ye düş.
      log.warn('Semantic cache lookup failed, skipping L1', err);
    }
  }

  // ── L2: Router ──────────────────────────────────────────────────────
  let servedModel = requestedModel;
  let servedMaxTokens = req.maxTokens;
  let routerTier = null as LlmResult['routerTier'];
  let routerOverheadTokens = 0;
  let routerOverheadCostUsd = 0;

  // Router yalnızca Anthropic isteklerine uygulanır (cheap kademe + sınıflandırıcı Haiku'dur).
  if (costConfig.layers.router && anthropic && router.isRoutable(req)) {
    try {
      const decision = await router.decide(req, classify);
      servedModel = decision.model;
      servedMaxTokens = decision.maxTokens;
      routerTier = decision.tier;
      routerOverheadTokens = decision.overheadTokens;
      routerOverheadCostUsd = decision.overheadCostUsd;
    } catch (err) {
      // Asla riskli downgrade yapma — hata olursa istenen modelde kal.
      log.warn('Router decision failed, keeping requested model', err);
    }
  }

  // ── L3: Prompt Caching ──────────────────────────────────────────────
  const usePromptCache = costConfig.layers.promptCache && isAnthropicModel(servedModel);
  const finalReq = usePromptCache
    ? promptCache.apply(req, { model: servedModel, maxTokens: servedMaxTokens })
    : {
        model: servedModel,
        maxTokens: servedMaxTokens,
        temperature: req.temperature,
        systemPrompt: req.systemPrompt,
        messages: req.messages,
        stopSequences: req.stopSequences,
      };
  const promptCacheApplied = finalReq.systemBlocks !== undefined;

  // ── Gerçek çağrı ────────────────────────────────────────────────────
  const exec = await executor(finalReq, onChunk);

  const result: LlmResult = {
    ...exec,
    requestedModel,
    servedModel,
    cacheHit: false,
    routerTier,
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
    // Gerçek maliyet = ana çağrı + router sınıflandırma çağrısının maliyeti.
    actualCostUsd: anthropic
      ? actualCallCost(servedModel, exec) + routerOverheadCostUsd
      : 0,
    baselineCostUsd: anthropic
      ? baselineCallCost(requestedModel, exec)
      : 0,
  });

  return result;
}

function recordHit(req: LlmRequest, requestedModel: LlmResult['requestedModel'], hit: LlmResult): void {
  // Cache hit → LLM çağrısı yok, gerçek maliyet 0;
  // baseline = bu çağrı normalde tüketecek olduğu token'ların ana model maliyeti.
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
    actualCostUsd: 0,
    baselineCostUsd: isAnthropicModel(requestedModel)
      ? baselineCallCost(requestedModel, {
          inputTokens: hit.baselineInputTokens ?? 0,
          outputTokens: hit.baselineOutputTokens ?? 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        })
      : 0,
  });
}

export const costMiddleware = { complete };
