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
    /** L0 — context compression before the call (headroom-style input-token reduction). */
    compression: envBool('COST_LAYER_COMPRESSION', true),
  },

  /**
   * L4 — Output minimization (ponytail-style). Injects a "lazy senior dev" decision-ladder
   * directive into agentic system prompts so coding agents write less over-engineered code →
   * fewer OUTPUT tokens. off (default, no behavior change) | lite (short nudge) | full (ladder).
   */
  outputMinimize: envStr<'off' | 'lite' | 'full'>('COST_OUTPUT_MINIMIZE', 'off'),

  /**
   * Exact-match cache for READ-ONLY agent tool results (read_file/list_files), keyed by
   * workspace + tool + sorted args, invalidated on any write to that workspace. Avoids redundant
   * tool re-execution within/across agentic turns (BetterDB agent-cache idea). ttl in ms.
   */
  toolResultCache: envBool('COST_TOOL_RESULT_CACHE', true),
  toolResultCacheTtlMs: envNum('COST_TOOL_RESULT_CACHE_TTL_MS', 30_000),

  /**
   * RTK-style aggressive compression of tool OUTPUT (listings/logs/command results) before it
   * re-enters the agentic context — repeated-line dedup + JSON minify + head/tail truncation.
   */
  toolOutputCompress: envBool('COST_TOOL_OUTPUT_COMPRESS', true),
  toolOutputMaxLines: envNum('COST_TOOL_OUTPUT_MAX_LINES', 200),

  /**
   * DLP egress guard — scan gateway prompts for secrets/PII before they leave to the provider.
   * `block=false` (default) → redact matches with [REDACTED:type] and continue; `block=true` → reject (422).
   */
  dlp: {
    enabled: envBool('COST_DLP', true),
    block: envBool('COST_DLP_BLOCK', false),
    secrets: envBool('COST_DLP_SECRETS', true),
    pii: envBool('COST_DLP_PII', true),
  },

  /** L0 compression — deterministic & conservative (no neural/AST in v1). */
  compression: {
    /** Mesaj içeriği bu karakterin altındaysa dokunma (küçük promptta fayda yok). */
    minChars: envNum('COST_COMPRESSION_MIN_CHARS', 400),
    /** Tek bir blok (dosya/dependency çıktısı) bu karakteri aşarsa head+tail bırakıp ortayı kırp. */
    maxBlockChars: envNum('COST_COMPRESSION_MAX_BLOCK_CHARS', 12_000),
    /** Geçerli JSON bloklarını minify et. */
    jsonMinify: envBool('COST_COMPRESSION_JSON_MINIFY', true),
  },

  semanticCache: {
    /** Benzerlik eşiği. 0.90 + judge gate ile paraphrase'leri güvenle yakalar. */
    threshold: envNum('COST_SEMANTIC_THRESHOLD', 0.90),
    /**
     * LLM-as-judge gate (BetterDB "full" mode). When ON, similarities in the UNCERTAIN band
     * [judgeThreshold, threshold) are confirmed by a cheap model ("same question?") before serving
     * → safely catches more paraphrases without raising false-positive risk. Off by default
     * (adds one cheap call on uncertain hits).
     */
    judge: envBool('COST_SEMANTIC_JUDGE', true),
    judgeThreshold: envNum('COST_SEMANTIC_JUDGE_THRESHOLD', 0.80),
    ttlSeconds: envNum('COST_SEMANTIC_TTL_SECONDS', 60 * 60 * 24),
    /** Embedder seçimi — gemini varsayılan (kullanıcının Gemini key'iyle çalışır). */
    embeddingProvider: envStr<'gemini' | 'voyage' | 'openai' | 'local'>(
      'COST_EMBEDDING_PROVIDER',
      'gemini',
    ),
    geminiModel: envStr('COST_GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001'),
    voyageModel: envStr('COST_VOYAGE_MODEL', 'voyage-3'),
    openaiModel: envStr('COST_OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
    qdrantUrl: envStr('COST_QDRANT_URL', 'http://localhost:6333'),
    collection: envStr('COST_QDRANT_COLLECTION', 'agenticbear_llm_cache'),
  },

  router: {
    /** Per-provider tier mapping. Built-in family yoksa L2 atlanır (güvenli). */
    tiers: {
      anthropic: {
        cheapModel: envStr('COST_ROUTER_ANTHROPIC_CHEAP', envStr('COST_ROUTER_CHEAP_MODEL', 'claude-haiku-4-5-20251001')),
        classifierModel: envStr('COST_ROUTER_ANTHROPIC_CLASSIFIER', envStr('COST_ROUTER_CLASSIFIER_MODEL', 'claude-haiku-4-5-20251001')),
      },
      openai: {
        cheapModel: envStr('COST_ROUTER_OPENAI_CHEAP', 'gpt-4o-mini'),
        classifierModel: envStr('COST_ROUTER_OPENAI_CLASSIFIER', 'gpt-4o-mini'),
      },
      gemini: {
        cheapModel: envStr('COST_ROUTER_GEMINI_CHEAP', 'gemini-2.5-flash-lite'),
        classifierModel: envStr('COST_ROUTER_GEMINI_CLASSIFIER', 'gemini-2.5-flash-lite'),
      },
    } as Record<'anthropic' | 'openai' | 'gemini', { cheapModel: string; classifierModel: string }>,
    classifierMaxTokens: envNum('COST_ROUTER_CLASSIFIER_MAX_TOKENS', 5),
    /** TRIVIAL için kısılmış üst sınır. */
    trivialMaxTokens: envNum('COST_ROUTER_TRIVIAL_MAX_TOKENS', 512),
    /**
     * Sadece istenen modelin blended fiyatı ($/1K in+out) bunun üzerindeyse route et. Ucuz
     * modellerde (nano/lite/flash) sınıflandırma masrafı tasarrufu yer → route etme. Pahalı tavan
     * modellerde (Opus/GPT-5/Sonnet) downgrade tasarrufu masrafı kat kat aşar.
     */
    minCeilingPrice: envNum('COST_ROUTER_MIN_CEILING_PRICE', 0.006),
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
