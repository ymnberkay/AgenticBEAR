/**
 * L1 — Semantic Cache (Qdrant + embedding).
 *
 * Akış:
 *   1. cacheable mı? (yan etkisiz / düşük temperature / uçucu değil)
 *   2. Ucuz EXACT-MATCH: normalize edilmiş prompt hash'i ile namespace içinde ara.
 *   3. Tutmazsa SEMANTIC: prompt'u embed et → en yakın komşu → benzerlik ≥ eşik?
 *   4. Hit ise TTL kontrolü; geçerliyse cache'teki cevabı döndür (LLM yok).
 *
 * Namespace role/agent bazlı (orkestratör cache'i ≠ frontend-agent cache'i).
 * Dayanıklılık: embedding/Qdrant erişilemezse hata YUTULUR → miss döner, sessizce L2'ye düşülür.
 */
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../utils/logger.js';
import { costConfig } from '../config.js';
import { getEmbedder } from '../embedding.js';
import { QdrantStore } from '../vector-store.js';
import { canonicalText, namespaceOf, promptHash, agentNamespace } from '../hash.js';
import { poolFor, cheapest } from './model-select.js';
import type { CacheKind, CachePayload, Classifier, Embedder, LlmRequest, LlmResult, VectorStore } from '../types.js';

const JUDGE_SYSTEM =
  `Two user requests, A and B. If the SAME answer would correctly serve BOTH (same intent), ` +
  `reply YES. Otherwise reply NO. Reply with only YES or NO.`;

/** Confirm a borderline semantic match with a cheap model before serving it from cache. */
async function judgeEquivalent(judge: Classifier, req: LlmRequest, newText: string, cachedPrompt: string): Promise<boolean> {
  const cheap = cheapest(await poolFor(req.meta.routePool, req.providerId, req.model)) ?? { model: req.model, providerId: req.providerId };
  try {
    const res = await judge({
      model: cheap.model, providerId: cheap.providerId, maxTokens: 3,
      systemPrompt: JUDGE_SYSTEM,
      userMessage: `A: ${newText.slice(0, 1500)}\n\nB: ${cachedPrompt.slice(0, 1500)}`,
    });
    return /\byes\b/i.test(res.text);
  } catch {
    return false; // judge down → treat as miss (safe)
  }
}

const log = createLogger('cost:l1');

// Test/override için enjekte edilebilir backend'ler.
let embedderOverride: Embedder | null = null;
let storeOverride: VectorStore | null = null;
let storeSingleton: VectorStore | null = null;

function resolveEmbedder(): Embedder {
  return embedderOverride ?? getEmbedder();
}
function resolveStore(): VectorStore {
  if (storeOverride) return storeOverride;
  if (!storeSingleton) storeSingleton = new QdrantStore();
  return storeSingleton;
}

/** Yalnızca testler için backend enjeksiyonu. */
export function __setBackendsForTest(opts: { embedder?: Embedder | null; store?: VectorStore | null }): void {
  if ('embedder' in opts) embedderOverride = opts.embedder ?? null;
  if ('store' in opts) storeOverride = opts.store ?? null;
  storeSingleton = null;
}

/**
 * Çağrının semantic cache'e uygun olup olmadığı.
 * Yan etkili / yüksek-temperature / uçucu çağrılar cache'lenmez; cacheable açıkça true olmalı.
 */
export function isCacheable(req: LlmRequest): boolean {
  if (req.meta.cacheable !== true) return false;
  // FAQ-mode (lastUser) keys explicitly opt into caching regardless of temperature.
  if (req.meta.cacheScope !== 'lastUser' && typeof req.temperature === 'number' && req.temperature > 0.3) return false;
  if (req.meta.callKind === 'routing' || req.meta.callKind === 'classification') return false;
  return true;
}

function isExpired(payload: CachePayload): boolean {
  const ageMs = Date.now() - payload.createdAt;
  return ageMs > costConfig.semanticCache.ttlSeconds * 1000;
}

function toResult(req: LlmRequest, payload: CachePayload, kind: CacheKind): LlmResult {
  return {
    text: payload.response,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    stopReason: 'end_turn',
    requestedModel: req.model,
    servedModel: payload.model,
    cacheHit: true,
    cacheKind: kind,
    routerTier: null,
    baselineInputTokens: payload.inputTokens,
    baselineOutputTokens: payload.outputTokens,
    // Middleware cache-hit yolunda gerçek değerleri tekrar hesaplar; burada placeholder.
    actualCostUsd: 0,
    baselineCostUsd: 0,
    compressionSavedTokens: 0,
  };
}

/** Cache'te ara. Miss veya herhangi bir hata → null (sessizce L2'ye düş). */
export async function lookup(req: LlmRequest, judge?: Classifier): Promise<LlmResult | null> {
  const ns = namespaceOf(req);
  const text = canonicalText(req);
  const vs = resolveStore();

  // 1) Ucuz exact-match
  try {
    const hash = promptHash(ns, text);
    const exact = await vs.findByHash(ns, hash);
    if (exact && !isExpired(exact)) {
      log.info(`L1 exact-match hit (ns=${ns})`);
      return toResult(req, exact, 'exact');
    }
  } catch (err) {
    // Collection-not-found = cold-start (henüz hiç yazım yapılmadı); log spam'i olmasın.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/doesn'?t exist|not found|404/i.test(msg)) {
      log.warn('L1 exact-match lookup failed', err);
    }
    // Exact-match patladıysa semantic'i de denemeyelim — büyük olasılıkla Qdrant down.
    return null;
  }

  // 2) Semantic arama
  const emb = resolveEmbedder();
  if (!(await emb.available())) return null;

  try {
    const vector = await emb.embed(text);
    const hits = await vs.search(ns, vector, 1);
    const top = hits[0];
    if (top && !isExpired(top.payload)) {
      // High confidence → serve directly.
      if (top.score >= costConfig.semanticCache.threshold) {
        log.info(`L1 semantic hit (ns=${ns}, score=${top.score.toFixed(3)})`);
        return toResult(req, top.payload, 'semantic');
      }
      // Uncertain band → confirm with a cheap LLM-as-judge before serving.
      if (judge && costConfig.semanticCache.judge && top.score >= costConfig.semanticCache.judgeThreshold) {
        if (await judgeEquivalent(judge, req, text, top.payload.prompt)) {
          log.info(`L1 semantic hit via judge (ns=${ns}, score=${top.score.toFixed(3)})`);
          return toResult(req, top.payload, 'judge');
        }
      }
    }
  } catch (err) {
    log.warn('L1 semantic lookup failed', err);
  }
  return null;
}

/** Sonucu cache'e yaz. Hatalar yutulur (cache opsiyoneldir). */
export async function store(req: LlmRequest, result: LlmResult): Promise<void> {
  if (!result.text) return;
  const emb = resolveEmbedder();
  if (!(await emb.available())) return;

  const ns = namespaceOf(req);
  const text = canonicalText(req);
  try {
    const vector = await emb.embed(text);
    const vs = resolveStore();
    await vs.ensureCollection(vector.length);
    const payload: CachePayload = {
      namespace: ns,
      promptHash: promptHash(ns, text),
      prompt: text,
      response: result.text,
      model: result.servedModel,
      role: req.meta.role,
      createdAt: Date.now(),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
    await vs.upsert({ id: randomUUID(), vector, payload });
  } catch (err) {
    log.warn('L1 store failed', err);
  }
}

/**
 * Sistem promptu / tool tanımları değişince ilgili namespace'i temizle.
 * role + agentSlug ile çağrılır (namespaceOf ile aynı format).
 */
export async function invalidateNamespace(namespace: string): Promise<void> {
  try {
    await resolveStore().deleteByNamespace(namespace);
    log.info(`L1 namespace invalidated: ${namespace}`);
  } catch (err) {
    log.warn(`L1 invalidate failed for ${namespace}`, err);
  }
}

/** namespaceOf ile tutarlı namespace üreticisi (invalidation çağıranları için). */
export function namespaceFor(opts: {
  projectId?: string;
  role: string;
  agentSlug?: string;
  providerId?: string;
  model?: string;
}): string {
  return agentNamespace(opts);
}
