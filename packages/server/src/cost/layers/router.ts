/**
 * L2 — Router (3 kademe), provider-agnostic.
 *
 * Kısa, ucuz bir sınıflandırma çağrısı (her provider'ın kendi en ucuz/küçük modeli ile,
 * max_tokens ~5) görevi TRIVIAL / SIMPLE / COMPLEX olarak etiketler:
 *   TRIVIAL → cheapModel + düşük max_tokens
 *   SIMPLE  → cheapModel
 *   COMPLEX → ana model (istenen model)
 *
 * Her ana provider ailesinin (anthropic | openai | gemini) kendi cheap/classifier modeli
 * config'ten gelir. Tanınmayan / custom (-compatible) provider'larda L2 atlanır (güvenli).
 *
 * Fallback: sınıflandırma çıktısı bu üç kelimeden biri değilse veya çağrı patlarsa
 * → güvenli tarafta COMPLEX (istenen model). Asla riskli downgrade yok.
 *
 * Router yalnızca model/max_tokens'ı seçer; agent mantığını veya tool erişimini değiştirmez.
 * Sınıflandırma çağrısının kendi token maliyeti overhead olarak raporlanır.
 */
import { isBuiltinProviderId } from '@subagent/shared';
import type { ClaudeModel, ProviderKind } from '@subagent/shared';
import type { RouterTier } from '../config.js';
import { costConfig } from '../config.js';
import { modelPricing } from '../../llm/provider-registry.js';
import { providerRepo } from '../../db/repositories/provider.repo.js';
import { actualCallCost } from '../pricing.js';
import type { Classifier, LlmRequest } from '../types.js';

export interface RouterDecision {
  model: ClaudeModel;
  maxTokens: number;
  tier: RouterTier | null;
  /** Sınıflandırma çağrısının toplam token'ı (görünürlük için). */
  overheadTokens: number;
  /** Sınıflandırma çağrısının $ maliyeti (gerçek maliyete eklenir). */
  overheadCostUsd: number;
}

const CLASSIFY_SYSTEM =
  `Görevi zorluğuna göre TEK KELİME ile sınıflandır.\n` +
  `TRIVIAL = selamlama, tek satır, neredeyse çıktısız.\n` +
  `SIMPLE = kısa olgusal yanıt, hafif akıl yürütme.\n` +
  `COMPLEX = analiz, çok adımlı işlem, uzun sentez, kod yazımı.\n` +
  `Yalnızca şu üç kelimeden BİRİNİ döndür: TRIVIAL, SIMPLE, COMPLEX. Başka hiçbir şey yazma.`;

/** Sınıflandırmaya gönderilecek kullanıcı metni için üst sınır (maliyeti küçük tut). */
const CLASSIFY_INPUT_CHAR_CAP = 2000;

/** Bu çağrı router'a sokulmalı mı? routing/classification kendisi router'dan geçmez. */
export function isRoutable(req: LlmRequest): boolean {
  return req.meta.callKind !== 'routing' && req.meta.callKind !== 'classification';
}

/** Built-in family. */
function builtinFamily(kind: ProviderKind | undefined): 'anthropic' | 'openai' | 'gemini' | null {
  if (kind === 'anthropic') return 'anthropic';
  if (kind === 'openai') return 'openai';
  if (kind === 'gemini') return 'gemini';
  return null;
}

interface TierResolution {
  cheapModel: string;
  classifierModel: string;
  providerId: string;
}

/**
 * Tier kararları:
 *  1) Built-in provider (anthropic/openai/gemini) → config.router.tiers'tan
 *  2) Custom provider (-compatible) → DB'den, en ucuz model = cheap = classifier
 *  3) Çözülemiyor → null (L2 atlanır)
 *
 * Aynı (en ucuz) model zaten servis ediliyorsa downgrade yok → null.
 */
function resolveTiers(req: LlmRequest): TierResolution | null {
  // Built-in family
  const builtin = builtinFamily(req.providerKind);
  if (builtin) {
    const cfg = costConfig.router.tiers[builtin];
    if (!cfg) return null;
    if (cfg.cheapModel === req.model) return null;
    return { cheapModel: cfg.cheapModel, classifierModel: cfg.classifierModel, providerId: builtin };
  }

  // Custom provider — kullanıcının verdiği modellerden en ucuzu cheap = classifier.
  if (req.providerId && !isBuiltinProviderId(req.providerId)) {
    const custom = providerRepo.findById(req.providerId);
    if (!custom || custom.enabled === false || custom.models.length < 2) return null;
    const sorted = [...custom.models].sort(
      (a, b) => (a.costPer1kInput ?? 0) - (b.costPer1kInput ?? 0),
    );
    const cheapest = sorted[0];
    if (cheapest.id === req.model) return null; // zaten en ucuzu kullanıyor
    return { cheapModel: cheapest.id, classifierModel: cheapest.id, providerId: req.providerId };
  }

  return null;
}

function lastUserText(req: LlmRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    if (req.messages[i].role === 'user') return req.messages[i].content;
  }
  return req.messages.map((m) => m.content).join('\n');
}

/** Sınıflandırma çıktısını kademeye çevir; eşleşmezse güvenli COMPLEX. */
export function parseTier(text: string): RouterTier {
  const up = text.toUpperCase();
  if (/\bTRIVIAL\b/.test(up)) return 'TRIVIAL';
  if (/\bSIMPLE\b/.test(up)) return 'SIMPLE';
  return 'COMPLEX';
}

function keepRequested(req: LlmRequest, tier: RouterTier | null): RouterDecision {
  return { model: req.model, maxTokens: req.maxTokens, tier, overheadTokens: 0, overheadCostUsd: 0 };
}

/**
 * Model/max_tokens kararı. classify yoksa, family tanınmıyorsa veya hata olursa
 * istenen modelde kalır.
 */
export async function decide(req: LlmRequest, classify?: Classifier): Promise<RouterDecision> {
  if (!classify) return keepRequested(req, null);

  const tiers = resolveTiers(req);
  if (!tiers) return keepRequested(req, null);

  const { classifierMaxTokens, trivialMaxTokens } = costConfig.router;
  const { cheapModel, classifierModel, providerId } = tiers;

  let tier: RouterTier;
  let overheadTokens = 0;
  let overheadCostUsd = 0;
  try {
    const res = await classify({
      model: classifierModel,
      providerId,
      maxTokens: classifierMaxTokens,
      systemPrompt: CLASSIFY_SYSTEM,
      userMessage: lastUserText(req).slice(0, CLASSIFY_INPUT_CHAR_CAP),
    });
    tier = parseTier(res.text);
    overheadTokens = res.inputTokens + res.outputTokens;
    const classifierPricing = modelPricing(providerId, classifierModel);
    overheadCostUsd = actualCallCost(classifierPricing, {
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  } catch {
    // Sınıflandırma patladı → güvenli tarafta istenen modelde kal (downgrade yok).
    return keepRequested(req, null);
  }

  if (tier === 'TRIVIAL') {
    return {
      model: cheapModel as ClaudeModel,
      maxTokens: Math.min(req.maxTokens, trivialMaxTokens),
      tier,
      overheadTokens,
      overheadCostUsd,
    };
  }
  if (tier === 'SIMPLE') {
    return { model: cheapModel as ClaudeModel, maxTokens: req.maxTokens, tier, overheadTokens, overheadCostUsd };
  }
  // COMPLEX → ana model.
  return { model: req.model, maxTokens: req.maxTokens, tier: 'COMPLEX', overheadTokens, overheadCostUsd };
}
