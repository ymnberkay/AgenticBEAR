/**
 * Cost-layer middleware için ortak tipler.
 * Bu tipler choke-point'in (ClaudeService → costMiddleware) sözleşmesini tanımlar.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeModel } from '@subagent/shared';
import type { RouterTier } from './config.js';

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
  callKind?: 'agent' | 'orchestration' | 'documentation' | 'routing' | 'classification';
  /**
   * L1 semantic cache'e açık mı?
   * Tool kullanan / yan etkili / yüksek-temperature / kullanıcıya özel uçucu çağrılarda false olmalı.
   * undefined → middleware güvenli varsayılan uygular.
   */
  cacheable?: boolean;
  /** Streaming çağrısı mı (L1 cache hit'i streaming'de chunk olarak yayınlanır). */
  isStream?: boolean;
}

/** Choke-point'e giren istek (çağıranın niyeti). */
export interface LlmRequest {
  model: ClaudeModel;
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
 */
export type Classifier = (params: {
  model: ClaudeModel;
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
  available(): boolean;
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
