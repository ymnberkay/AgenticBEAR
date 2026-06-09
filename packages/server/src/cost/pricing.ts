/**
 * Cache-farkındalıklı maliyet hesabı.
 * Fiyatlar çağıran tarafından bir Pricing nesnesi olarak verilir (built-in CLAUDE_MODELS
 * veya custom provider model fiyatı — bkz. llm/provider-registry.modelPricing).
 * cache okuma/yazma çarpanları config'ten. Bu sayede DeepSeek/yerel dahil HER sağlayıcının
 * maliyeti gerçek usage token'larıyla ölçülür.
 */
import { costConfig } from './config.js';

export interface Pricing {
  /** USD per 1K input tokens. */
  costPer1kInput: number;
  /** USD per 1K output tokens. */
  costPer1kOutput: number;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

/**
 * Bir çağrının gerçek maliyeti (cache çarpanları uygulanmış).
 * cache_read girdi fiyatının ~%10'u, cache_creation ~%125'i.
 */
export function actualCallCost(pricing: Pricing, usage: Usage): number {
  const inK = pricing.costPer1kInput / 1000;
  const outK = pricing.costPer1kOutput / 1000;
  return (
    usage.inputTokens * inK +
    usage.outputTokens * outK +
    usage.cacheReadInputTokens * inK * costConfig.pricing.cacheReadMultiplier +
    usage.cacheCreationInputTokens * inK * costConfig.pricing.cacheWriteMultiplier
  );
}

/**
 * Baseline maliyet: hiçbir katman yokmuş gibi.
 * İstenen modele, cache'siz, tam prefix-miss (tüm cache token'ları normal girdi sayılır).
 */
export function baselineCallCost(pricing: Pricing, usage: Usage): number {
  const inK = pricing.costPer1kInput / 1000;
  const outK = pricing.costPer1kOutput / 1000;
  const totalInput =
    usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  return totalInput * inK + usage.outputTokens * outK;
}
