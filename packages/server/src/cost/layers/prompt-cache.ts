/**
 * L3 — Prompt Caching (Anthropic ephemeral cache).
 *
 * Statik prefiks'i (system promptu / büyük sabit context) cache'ler:
 *   - cache_control: { type: "ephemeral" } statik prefiks'in SON bloğuna konur.
 *   - Sıralama tools → system → messages. Bu kod tabanında tool tanımı yok; statik olan
 *     system promptu başta, değişen kullanıcı mesajı (mesajlar) sonda → prefiks kaymaz.
 *   - Min cacheable uzunluğun altındaki prefiksler cache'lenmez (faydasız) → L3 atlanır.
 *
 * Kazanç, aynı system prefiksinin TTL içinde (5dk) tekrar OKUNMASINDAN gelir
 * (örn. aynı agent'ın bir run içindeki ardışık task çağrıları). En az 2 okuma → kâr.
 *
 * NOT (SDK 0.52): CacheControlEphemeral yalnızca { type: 'ephemeral' } (5dk) destekler.
 * config.promptCache.ttl === '1h' verilse bile bu SDK sürümünde 5dk uygulanır
 * (1h extended TTL daha yeni SDK + 'extended-cache-ttl' beta header ister).
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeModel } from '@subagent/shared';
import { costConfig, promptCacheMinTokens } from '../config.js';
import type { FinalRequest, LlmRequest } from '../types.js';

/** Ucuz token tahmini (≈ 1 token / 4 karakter). Yalnızca min-token gate için. */
export function estimatePrefixTokens(text: string): number {
  return Math.ceil(text.length / costConfig.promptCache.charsPerToken);
}

/** Prefiks cache'lenecek kadar büyük mü? (model bazlı min eşik) */
export function shouldCachePrefix(model: ClaudeModel, systemPrompt: string | undefined): boolean {
  if (!systemPrompt) return false;
  return estimatePrefixTokens(systemPrompt) >= promptCacheMinTokens(model);
}

function ephemeralCacheControl(): Anthropic.CacheControlEphemeral {
  return { type: 'ephemeral' };
}

/**
 * Router kararıyla birleştirilmiş nihai istek üzerinde prompt-cache uygula.
 * Prefiks yeterince büyükse system'i tek bir cache_control'lü text bloğuna çevirir;
 * değilse düz systemPrompt'u korur (L3 atlanır).
 */
export function apply(
  req: LlmRequest,
  routed: { model: ClaudeModel; maxTokens: number },
): FinalRequest {
  const base: FinalRequest = {
    model: routed.model,
    maxTokens: routed.maxTokens,
    temperature: req.temperature,
    systemPrompt: req.systemPrompt,
    messages: req.messages,
    stopSequences: req.stopSequences,
  };

  if (!shouldCachePrefix(routed.model, req.systemPrompt)) {
    return base;
  }

  base.systemBlocks = [
    {
      type: 'text',
      text: req.systemPrompt as string,
      cache_control: ephemeralCacheControl(),
    },
  ];
  return base;
}
