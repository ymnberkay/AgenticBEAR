/**
 * L2 — Router (3 kademe).
 *
 * Kısa, ucuz bir sınıflandırma çağrısı (Haiku 4.5, max_tokens ~5) ile görevi
 * TRIVIAL / SIMPLE / COMPLEX olarak etiketler ve modeli seçer:
 *   TRIVIAL → cheapModel + düşük max_tokens
 *   SIMPLE  → cheapModel
 *   COMPLEX → ana model (istenen model)
 *
 * Fallback: sınıflandırma çıktısı bu üç kelimeden biri değilse veya çağrı patlarsa
 * → güvenli tarafta COMPLEX (istenen model). Asla riskli downgrade yok.
 *
 * Router yalnızca model/max_tokens'ı seçer; agent mantığını veya tool erişimini değiştirmez.
 * Sınıflandırma çağrısının kendi token maliyeti overhead olarak raporlanır.
 */
import type { ClaudeModel } from '@subagent/shared';
import type { RouterTier } from '../config.js';
import { costConfig } from '../config.js';
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
 * Model/max_tokens kararı. classify yoksa veya hata olursa istenen modelde kalır.
 */
export async function decide(req: LlmRequest, classify?: Classifier): Promise<RouterDecision> {
  if (!classify) return keepRequested(req, null);

  const { cheapModel, classifierModel, classifierMaxTokens, trivialMaxTokens } = costConfig.router;

  let tier: RouterTier;
  let overheadTokens = 0;
  let overheadCostUsd = 0;
  try {
    const res = await classify({
      model: classifierModel,
      maxTokens: classifierMaxTokens,
      systemPrompt: CLASSIFY_SYSTEM,
      userMessage: lastUserText(req).slice(0, CLASSIFY_INPUT_CHAR_CAP),
    });
    tier = parseTier(res.text);
    overheadTokens = res.inputTokens + res.outputTokens;
    overheadCostUsd = actualCallCost(classifierModel, {
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
      model: cheapModel,
      maxTokens: Math.min(req.maxTokens, trivialMaxTokens),
      tier,
      overheadTokens,
      overheadCostUsd,
    };
  }
  if (tier === 'SIMPLE') {
    return { model: cheapModel, maxTokens: req.maxTokens, tier, overheadTokens, overheadCostUsd };
  }
  // COMPLEX (veya tanınmayan → parseTier zaten COMPLEX) → ana model.
  return { model: req.model, maxTokens: req.maxTokens, tier: 'COMPLEX', overheadTokens, overheadCostUsd };
}
