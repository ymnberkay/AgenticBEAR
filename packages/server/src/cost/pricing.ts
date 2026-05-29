/**
 * Cache-farkındalıklı maliyet hesabı.
 * Fiyatlar shared/CLAUDE_MODELS'tan (1k-başı $) gelir; cache okuma/yazma çarpanları config'ten.
 * shared/estimateCost'a dokunulmaz — bu cost katmanına özel.
 */
import { CLAUDE_MODELS } from '@subagent/shared';
import type { ClaudeModel } from '@subagent/shared';
import { costConfig } from './config.js';

function perToken(model: ClaudeModel): { inK: number; outK: number } {
  const p = CLAUDE_MODELS[model];
  if (!p) return { inK: 0, outK: 0 };
  return { inK: p.costPer1kInput / 1000, outK: p.costPer1kOutput / 1000 };
}

/**
 * Bir çağrının gerçek maliyeti (cache çarpanları uygulanmış).
 * cache_read girdi fiyatının ~%10'u, cache_creation ~%125'i.
 */
export function actualCallCost(
  model: ClaudeModel,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  },
): number {
  const { inK, outK } = perToken(model);
  return (
    usage.inputTokens * inK +
    usage.outputTokens * outK +
    usage.cacheReadInputTokens * inK * costConfig.pricing.cacheReadMultiplier +
    usage.cacheCreationInputTokens * inK * costConfig.pricing.cacheWriteMultiplier
  );
}

/**
 * Baseline maliyet: hiçbir katman yokmuş gibi.
 * Ana modele (istenen model), cache'siz, tam prefix-miss (tüm cache token'ları normal girdi sayılır).
 */
export function baselineCallCost(
  requestedModel: ClaudeModel,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  },
): number {
  const { inK, outK } = perToken(requestedModel);
  const totalInput =
    usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  return totalInput * inK + usage.outputTokens * outK;
}
