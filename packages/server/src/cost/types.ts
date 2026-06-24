/**
 * Cost-layer middleware için ortak tipler.
 * Bu tipler choke-point'in (ClaudeService → costMiddleware) sözleşmesini tanımlar.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeModel, ProviderKind } from '@subagent/shared';
import type { RouterTier } from './config.js';
import type { Pricing } from './pricing.js';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Çağrı meta verisi — katmanların davranışını belirler.
 * Çağıranlar opsiyonel geçirir; yoksa güvenli varsayılanlar uygulanır.
 */
export interface CallMeta {
  /** Cache namespace'i + metrik etiketi (orchestrator | specialist | documentation | routing ...). */
  role?: string;
  /** Namespace çözünürlüğünü artırmak için (örn. agent slug). */
  agentSlug?: string;
  /** Çağrının türü; routing/classification gibi çağrılar router'a sokulmaz. */
  callKind?: 'agent' | 'orchestration' | 'documentation' | 'routing' | 'classification' | 'gateway';
  /**
   * L1 semantic cache'e açık mı?
   * Tool kullanan / yan etkili / yüksek-temperature / kullanıcıya özel uçucu çağrılarda false olmalı.
   * undefined → middleware güvenli varsayılan uygular.
   */
  cacheable?: boolean;
  /**
   * L0 context compression'a açık mı? Hassas/birebir gereken içerikte false olmalı.
   * undefined → varsayılan açık (compress edilir).
   */
  compressible?: boolean;
  /** Streaming çağrısı mı (L1 cache hit'i streaming'de chunk olarak yayınlanır). */
  isStream?: boolean;
  /**
   * L1 cache anahtarı neyi kapsasın:
   *  - 'conversation' (varsayılan): system + TÜM mesajlar (bağlam-bağımlı; güvenli).
   *  - 'lastUser': system + yalnızca SON kullanıcı mesajı → büyüyen geçmişe rağmen aynı soru
   *    güvenle hit eder (FAQ/destek botları için). Bağlam-bağımlı botlarda yanlış hit riski olur.
   */
  cacheScope?: 'conversation' | 'lastUser';
  /**
   * L2 level-router için aday model havuzu (catalog id'leri ve/veya `owner:<provider>` joker).
   * Gateway bunu API key'in izinli modellerinden doldurur. Boş/undefined → istenen modelin
   * provider'ı içinde kalır (güvenli varsayılan).
   */
  routePool?: string[];
}

/** Choke-point'e giren istek (çağıranın niyeti). */
export interface LlmRequest {
  model: ClaudeModel;
  /** Resolved provider id (built-in or custom). */
  providerId?: string;
  /** Provider family — gates L2/L3 (only the Anthropic family supports them). */
  providerKind?: ProviderKind;
  /** Requested-model pricing ($/1K). Resolved by the caller (registry); enables cost for any provider. */
  pricing?: Pricing;
  maxTokens: number;
  temperature?: number;
  systemPrompt?: string;
  messages: LlmMessage[];
  stopSequences?: string[];
  meta: CallMeta;
}

/**
 * Katmanlardan geçtikten sonra executor'a verilen nihai istek.
 * - Router `model`/`maxTokens`'ı değiştirebilir.
 * - Prompt cache `systemBlocks` ve `cacheControl*` alanlarını doldurur (varsa executor bunları tercih eder).
 */
export interface FinalRequest {
  model: ClaudeModel;
  /** Resolved provider id — tells the executor which provider/endpoint to call. */
  providerId?: string;
  maxTokens: number;
  temperature?: number;
  systemPrompt?: string;
  /** L3 doldurursa executor `systemPrompt` yerine bunu kullanır. */
  systemBlocks?: Anthropic.TextBlockParam[];
  messages: LlmMessage[];
  stopSequences?: string[];
}

/** Executor'ın döndürdüğü ham sonuç (gerçek usage'dan). */
export interface ExecutorResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  stopReason: string | null;
}

/** Gerçek SDK çağrısını yapan fonksiyon — ClaudeService sağlar. */
export type Executor = (
  req: FinalRequest,
  onChunk?: (chunk: string) => void,
) => Promise<ExecutorResult>;

/**
 * L2 router'ın kısa sınıflandırma çağrısı için fonksiyon.
 * ClaudeService sağlar; doğrudan SDK'ya gider (middleware'e geri özyineleme YOK).
 * providerId verilmezse model id'sinden built-in heuristic ile çözülür.
 */
export type Classifier = (params: {
  model: string;
  providerId?: string;
  maxTokens: number;
  systemPrompt: string;
  userMessage: string;
}) => Promise<{ text: string; inputTokens: number; outputTokens: number }>;

/** Middleware'in dış dünyaya bağımlılıkları. */
export interface MiddlewareDeps {
  executor: Executor;
  /** Yoksa router sınıflandırma yapamaz → güvenli tarafta istenen modelde kalır. */
  classify?: Classifier;
}

/** Choke-point'in döndürdüğü zenginleştirilmiş sonuç. */
export interface LlmResult extends ExecutorResult {
  /** İstenen model (router öncesi). */
  requestedModel: ClaudeModel;
  /** Gerçekte çağrılan model (router sonrası). */
  servedModel: ClaudeModel;
  cacheHit: boolean;
  routerTier: RouterTier | null;
  /**
   * Cache HIT'te: bu çağrı normalde tüketecek olduğu token'lar (baseline tasarruf hesabı için).
   * Normal çağrılarda undefined.
   */
  baselineInputTokens?: number;
  baselineOutputTokens?: number;
  /** Bu çağrının gerçek maliyeti ($USD) — caller'ın run_steps'e yazması için. */
  actualCostUsd: number;
  /**
   * Bu çağrının cost-layer olmasaydı maliyeti ($USD) — istenen modelde, cache hit yok,
   * router downgrade yok varsayımıyla. Savings = baseline - actual.
   */
  baselineCostUsd: number;
  /** L0 compression ile kazanılan input token (counterfactual). */
  compressionSavedTokens: number;
}

/** L1 cache entry payload'ı (Qdrant'a yazılır). */
export interface CachePayload {
  namespace: string;
  promptHash: string;
  prompt: string;
  response: string;
  model: ClaudeModel;
  role?: string;
  createdAt: number;
  inputTokens: number;
  outputTokens: number;
}

/** Embedding sağlayıcısı soyutlaması (Voyage / yerel). */
export interface Embedder {
  available(): Promise<boolean>;
  /** Erişilemezse hata fırlatır; semantic-cache yakalar ve L2'ye düşer. */
  embed(text: string): Promise<number[]>;
}

/** Vektör DB soyutlaması (Qdrant REST). */
export interface VectorStore {
  ensureCollection(dim: number): Promise<void>;
  upsert(point: { id: string; vector: number[]; payload: CachePayload }): Promise<void>;
  search(
    namespace: string,
    vector: number[],
    topK: number,
  ): Promise<Array<{ score: number; payload: CachePayload }>>;
  findByHash(namespace: string, hash: string): Promise<CachePayload | null>;
  deleteByNamespace(namespace: string): Promise<void>;
}
