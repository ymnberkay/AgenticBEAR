/**
 * Cost-layer middleware yapılandırması.
 *
 * Üç katman da bağımsız flag ile açılıp kapatılabilir (env override).
 * Varsayılan: üçü de AÇIK. Bir katman kapalıysa pipeline o adımı atlar.
 *
 * Env değişkenleri:
 *   COST_LAYER_SEMANTIC_CACHE = true|false   (L1)
 *   COST_LAYER_ROUTER         = true|false   (L2)
 *   COST_LAYER_PROMPT_CACHE   = true|false   (L3)
 *   COST_SEMANTIC_THRESHOLD   = 0..1         (L1 benzerlik eşiği)
 *   COST_SEMANTIC_TTL_SECONDS = saniye       (L1 entry TTL)
 *   COST_EMBEDDING_PROVIDER   = voyage|local
 *   COST_QDRANT_URL           = http://...   (L1 Qdrant)
 *   COST_METRICS_LAST_N       = sayı         (özet için son N çağrı)
 */
import type { ClaudeModel } from '@subagent/shared';

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envStr<T extends string>(name: string, fallback: T): T {
  const v = process.env[name];
  return (v === undefined || v === '' ? fallback : (v as T));
}

/** Router kademeleri → model eşlemesi. */
export type RouterTier = 'TRIVIAL' | 'SIMPLE' | 'COMPLEX';

/** Anthropic prompt-cache minimum cacheable prefix uzunlukları (token). */
const PROMPT_CACHE_MIN_TOKENS: Partial<Record<ClaudeModel, number>> = {
  'claude-opus-4-6': 4096,
  'claude-opus-4-5-20251101': 4096,
  'claude-opus-4-1-20250805': 4096,
  'claude-opus-4-20250514': 4096,
  'claude-haiku-4-5-20251001': 4096,
  'claude-3-haiku-20240307': 4096,
  'claude-sonnet-4-6': 2048,
  'claude-sonnet-4-5-20250929': 2048,
  'claude-sonnet-4-20250514': 2048,
};

export const costConfig = {
  layers: {
    semanticCache: envBool('COST_LAYER_SEMANTIC_CACHE', true),
    router: envBool('COST_LAYER_ROUTER', true),
    promptCache: envBool('COST_LAYER_PROMPT_CACHE', true),
  },

  semanticCache: {
    /** Benzerlik eşiği. Üretimde 0.95+ ile başlayıp ölçerek indir. */
    threshold: envNum('COST_SEMANTIC_THRESHOLD', 0.95),
    ttlSeconds: envNum('COST_SEMANTIC_TTL_SECONDS', 60 * 60 * 24),
    embeddingProvider: envStr<'voyage' | 'local'>('COST_EMBEDDING_PROVIDER', 'voyage'),
    voyageModel: envStr('COST_VOYAGE_MODEL', 'voyage-3'),
    qdrantUrl: envStr('COST_QDRANT_URL', 'http://localhost:6333'),
    collection: envStr('COST_QDRANT_COLLECTION', 'agenticbear_llm_cache'),
  },

  router: {
    /** Ucuz kademe (TRIVIAL + SIMPLE). */
    cheapModel: envStr<ClaudeModel>('COST_ROUTER_CHEAP_MODEL', 'claude-haiku-4-5-20251001'),
    /** Sınıflandırma çağrısının kendisi. */
    classifierModel: envStr<ClaudeModel>('COST_ROUTER_CLASSIFIER_MODEL', 'claude-haiku-4-5-20251001'),
    classifierMaxTokens: envNum('COST_ROUTER_CLASSIFIER_MAX_TOKENS', 5),
    /** TRIVIAL için kısılmış üst sınır. */
    trivialMaxTokens: envNum('COST_ROUTER_TRIVIAL_MAX_TOKENS', 512),
  },

  promptCache: {
    minTokens: PROMPT_CACHE_MIN_TOKENS,
    /** Anthropic ephemeral cache TTL. "5m" varsayılan; büyük seyrek prefiksler için "1h". */
    ttl: envStr<'5m' | '1h'>('COST_PROMPT_CACHE_TTL', '5m'),
    /** Kabaca 1 token ≈ 4 karakter; min-token gate'i ucuz tahminle uygula. */
    charsPerToken: 4,
  },

  /** Cache fiyat çarpanları (girdi fiyatına göre). */
  pricing: {
    cacheReadMultiplier: envNum('COST_CACHE_READ_MULTIPLIER', 0.1),
    cacheWriteMultiplier: envNum('COST_CACHE_WRITE_MULTIPLIER', 1.25),
  },

  metrics: {
    lastN: envNum('COST_METRICS_LAST_N', 100),
  },
};

/** Bir modelin Anthropic (Claude) olup olmadığını söyler — cost katmanları yalnız bunlara uygulanır. */
export function isAnthropicModel(model: string): boolean {
  return model.startsWith('claude-');
}

/** Verilen model için prompt-cache min token eşiği (bilinmiyorsa Sonnet eşiği). */
export function promptCacheMinTokens(model: ClaudeModel): number {
  return costConfig.promptCache.minTokens[model] ?? 2048;
}
