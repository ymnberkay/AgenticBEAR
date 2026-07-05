/**
 * L2 — Level-based router, provider-agnostic.
 *
 * A short, cheap classification call rates the request's complexity 1–10. The router then picks
 * the CHEAPEST candidate model whose capability level ≥ complexity, capped at the requested
 * model's level (the requested model is the ceiling — never an upgrade). Candidates come from the
 * route pool: the gateway API key's allowed models, or — if none — the requested model's provider.
 *
 * Fallback: classification fails / no cheaper eligible candidate → keep the requested model.
 * The router only picks model/provider/max_tokens; it never changes agent logic or tool access.
 */
import type { ClaudeModel } from '@subagent/shared';
import type { RouterTier } from '../config.js';
import { costConfig } from '../config.js';
import { contentText, hasMediaParts } from '../../llm/content.js';
import { modelPricing } from '../../llm/provider-registry.js';
import { actualCallCost } from '../pricing.js';
import {
  poolFor, levelOf, priceOf, selectForComplexity, cheapest, parseComplexity, COMPLEXITY_CLASSIFY_SYSTEM,
} from './model-select.js';
import type { Classifier, LlmRequest } from '../types.js';

export interface RouterDecision {
  model: ClaudeModel;
  /** Served provider (may differ from requested when routing across the key's allowed pool). */
  providerId?: string;
  maxTokens: number;
  tier: RouterTier | null;
  /** Sınıflandırma çağrısının toplam token'ı (görünürlük için). */
  overheadTokens: number;
  /** Sınıflandırma çağrısının $ maliyeti (gerçek maliyete eklenir). */
  overheadCostUsd: number;
}

/** Sınıflandırmaya gönderilecek kullanıcı metni için üst sınır (maliyeti küçük tut). */
const CLASSIFY_INPUT_CHAR_CAP = 2000;

/**
 * Bu çağrı router'a sokulmalı mı? routing/classification kendisi router'dan geçmez.
 * Media (image/video) taşıyan istekler de geçmez — sınıflandırıcı görseli göremez ve
 * downgrade hedefi vision desteklemeyebilir; istenen modelde kal.
 */
export function isRoutable(req: LlmRequest): boolean {
  if (hasMediaParts(req.messages)) return false;
  return req.meta.callKind !== 'routing' && req.meta.callKind !== 'classification';
}

function lastUserText(req: LlmRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    if (req.messages[i].role === 'user') return contentText(req.messages[i].content);
  }
  return req.messages.map((m) => contentText(m.content)).join('\n');
}

function keepRequested(req: LlmRequest, tier: RouterTier | null): RouterDecision {
  return { model: req.model, providerId: req.providerId, maxTokens: req.maxTokens, tier, overheadTokens: 0, overheadCostUsd: 0 };
}

/**
 * Pick model/provider by complexity. classify yoksa, havuzda alternatif yoksa veya hata olursa
 * istenen modelde kalır.
 */
export async function decide(req: LlmRequest, classify?: Classifier): Promise<RouterDecision> {
  if (!classify) return keepRequested(req, null);

  const pool = await poolFor(req.meta.routePool, req.providerId, req.model);
  const ceiling = levelOf(pool, req.providerId, req.model);
  // Anything cheaper to route to? (a candidate strictly below the ceiling)
  if (!pool.some((c) => c.level < ceiling)) return keepRequested(req, null);
  // Skip cheap ceilings — classifier overhead would outweigh the downgrade saving.
  const ceilingPrice = priceOf(pool, req.providerId, req.model);
  if (ceilingPrice > 0 && ceilingPrice < costConfig.router.minCeilingPrice) return keepRequested(req, null);

  const classifier = cheapest(pool);
  if (!classifier) return keepRequested(req, null);

  let complexity: number;
  let overheadTokens = 0;
  let overheadCostUsd = 0;
  try {
    const res = await classify({
      model: classifier.model,
      providerId: classifier.providerId,
      maxTokens: costConfig.router.classifierMaxTokens,
      systemPrompt: COMPLEXITY_CLASSIFY_SYSTEM,
      userMessage: lastUserText(req).slice(0, CLASSIFY_INPUT_CHAR_CAP),
    });
    complexity = parseComplexity(res.text);
    // Agentic aggressiveness: nudge worker sub-tasks toward the cheaper tier (orchestrator exempt).
    const bias = costConfig.router.agenticComplexityBias;
    if (bias > 0 && req.meta.callKind === 'agent' && req.meta.role !== 'orchestrator') {
      complexity = Math.max(1, complexity - bias);
    }
    overheadTokens = res.inputTokens + res.outputTokens;
    overheadCostUsd = actualCallCost(await modelPricing(classifier.providerId, classifier.model), {
      inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
    });
  } catch {
    return keepRequested(req, null);
  }

  const sel = selectForComplexity(pool, { providerId: req.providerId, model: req.model }, complexity);
  if (!sel.downgraded) {
    return { model: req.model, providerId: req.providerId, maxTokens: req.maxTokens, tier: 'COMPLEX', overheadTokens, overheadCostUsd };
  }
  // Downgraded → mark tier (drives L2 savings attribution); trim max_tokens for ultra-simple tasks.
  const tier: RouterTier = complexity <= 2 ? 'TRIVIAL' : 'SIMPLE';
  const maxTokens = tier === 'TRIVIAL' ? Math.min(req.maxTokens, costConfig.router.trivialMaxTokens) : req.maxTokens;
  return { model: sel.model as ClaudeModel, providerId: sel.providerId, maxTokens, tier, overheadTokens, overheadCostUsd };
}
