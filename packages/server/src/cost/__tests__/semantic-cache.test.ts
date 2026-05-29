import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as semanticCache from '../layers/semantic-cache.js';
import { costMiddleware } from '../middleware.js';
import { costConfig } from '../config.js';
import { costMetrics } from '../metrics.js';
import type { CachePayload, Embedder, Executor, LlmRequest, VectorStore } from '../types.js';

/** Deterministik sahte embedder: aynı metin → aynı vektör. */
function fakeEmbedder(available = true): Embedder {
  return {
    available: () => available,
    embed: async (text: string) => {
      // 8-boyutlu basit hash-vektörü (semantic değil ama exact tekrarda kararlı)
      const v = new Array(8).fill(0);
      for (let i = 0; i < text.length; i++) v[i % 8] += text.charCodeAt(i);
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    },
  };
}

/** Bellek-içi sahte Qdrant. */
function memStore(): VectorStore & { points: Array<{ vector: number[]; payload: CachePayload }> } {
  const points: Array<{ vector: number[]; payload: CachePayload }> = [];
  const cos = (a: number[], b: number[]) => {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot; // her iki vektör de normalize → cosine = dot
  };
  return {
    points,
    async ensureCollection() {},
    async upsert(p) {
      points.push({ vector: p.vector, payload: p.payload });
    },
    async search(namespace, vector, topK) {
      return points
        .filter((p) => p.payload.namespace === namespace)
        .map((p) => ({ score: cos(vector, p.vector), payload: p.payload }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
    async findByHash(namespace, hash) {
      return (
        points.find((p) => p.payload.namespace === namespace && p.payload.promptHash === hash)
          ?.payload ?? null
      );
    },
    async deleteByNamespace(namespace) {
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].payload.namespace === namespace) points.splice(i, 1);
      }
    },
  };
}

function req(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0, // cacheable olması için düşük
    systemPrompt: 'Sen bir yardımcısın.',
    messages: [{ role: 'user', content: 'Merhaba dünya' }],
    meta: { role: 'specialist', agentSlug: 'frontend', cacheable: true, callKind: 'agent' },
    ...overrides,
  };
}

function fakeExec(text = 'LLM cevabı') {
  let count = 0;
  const exec: Executor = async () => {
    count++;
    return {
      text,
      inputTokens: 200,
      outputTokens: 80,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      stopReason: 'end_turn',
    };
  };
  return { exec, calls: () => count };
}

describe('L1 — semantic cache', () => {
  let saved: typeof costConfig.layers;

  beforeEach(() => {
    saved = { ...costConfig.layers };
    costConfig.layers.semanticCache = true;
    costConfig.layers.router = false;
    costConfig.layers.promptCache = false;
    costMetrics.reset();
  });

  afterEach(() => {
    Object.assign(costConfig.layers, saved);
    semanticCache.__setBackendsForTest({ embedder: null, store: null });
  });

  it('miss → LLM çağrılır ve cache’e yazılır; ikinci kez HIT → LLM çağrılmaz', async () => {
    semanticCache.__setBackendsForTest({ embedder: fakeEmbedder(), store: memStore() });
    const { exec, calls } = fakeExec();

    const r1 = await costMiddleware.complete(req(), { executor: exec });
    expect(r1.cacheHit).toBe(false);
    expect(calls()).toBe(1);

    const r2 = await costMiddleware.complete(req(), { executor: exec });
    expect(r2.cacheHit).toBe(true);
    expect(r2.text).toBe('LLM cevabı');
    expect(calls()).toBe(1); // ikinci çağrıda LLM'e GİDİLMEDİ

    const stats = costMetrics.getStats();
    expect(stats.session.semanticCacheHits).toBe(1);
    expect(stats.session.semanticCacheMisses).toBe(1);
    // Hit'te gerçek maliyet 0, baseline > 0 → tasarruf
    expect(stats.session.cost.savedUsd).toBeGreaterThan(0);
  });

  it('farklı namespace (başka agent) → yanlış hit olmaz', async () => {
    semanticCache.__setBackendsForTest({ embedder: fakeEmbedder(), store: memStore() });
    const { exec, calls } = fakeExec();

    await costMiddleware.complete(req({ meta: { role: 'specialist', agentSlug: 'frontend', cacheable: true } }), { executor: exec });
    // Aynı prompt ama farklı agent → cache izole, miss bekleniyor
    const r = await costMiddleware.complete(req({ meta: { role: 'specialist', agentSlug: 'backend', cacheable: true } }), { executor: exec });

    expect(r.cacheHit).toBe(false);
    expect(calls()).toBe(2);
  });

  it('TTL dolmuşsa hit sayılmaz', async () => {
    semanticCache.__setBackendsForTest({ embedder: fakeEmbedder(), store: memStore() });
    const { exec } = fakeExec();
    const origTtl = costConfig.semanticCache.ttlSeconds;
    costConfig.semanticCache.ttlSeconds = -1; // her entry anında expired
    try {
      await costMiddleware.complete(req(), { executor: exec });
      const r = await costMiddleware.complete(req(), { executor: exec });
      expect(r.cacheHit).toBe(false);
    } finally {
      costConfig.semanticCache.ttlSeconds = origTtl;
    }
  });

  it('embedder/Qdrant erişilemezse graceful degradation (miss, hata yok)', async () => {
    // available() false → L1 hiç devreye girmez
    semanticCache.__setBackendsForTest({ embedder: fakeEmbedder(false), store: memStore() });
    const { exec, calls } = fakeExec();
    const r1 = await costMiddleware.complete(req(), { executor: exec });
    const r2 = await costMiddleware.complete(req(), { executor: exec });
    expect(r1.cacheHit).toBe(false);
    expect(r2.cacheHit).toBe(false);
    expect(calls()).toBe(2); // her seferinde LLM'e gidildi, hata fırlamadı
  });

  it('store fırlatırsa middleware patlamaz (dayanıklılık)', async () => {
    const broken: VectorStore = {
      async ensureCollection() {},
      async upsert() {
        throw new Error('Qdrant down');
      },
      async search() {
        throw new Error('Qdrant down');
      },
      async findByHash() {
        throw new Error('Qdrant down');
      },
      async deleteByNamespace() {},
    };
    semanticCache.__setBackendsForTest({ embedder: fakeEmbedder(), store: broken });
    const { exec, calls } = fakeExec();
    const r = await costMiddleware.complete(req(), { executor: exec });
    expect(r.cacheHit).toBe(false);
    expect(calls()).toBe(1);
  });

  it('yüksek temperature → cacheable değil (cache atlanır)', () => {
    expect(semanticCache.isCacheable(req({ temperature: 0.7 }))).toBe(false);
    expect(semanticCache.isCacheable(req({ temperature: 0 }))).toBe(true);
    expect(semanticCache.isCacheable(req({ meta: { cacheable: false } }))).toBe(false);
  });

  it('invalidateNamespace ilgili entry’leri siler → tekrar miss', async () => {
    const store = memStore();
    semanticCache.__setBackendsForTest({ embedder: fakeEmbedder(), store });
    const { exec, calls } = fakeExec();

    await costMiddleware.complete(req(), { executor: exec }); // miss + store
    await costMiddleware.complete(req(), { executor: exec }); // hit
    expect(calls()).toBe(1);

    await semanticCache.invalidateNamespace('specialist:frontend');
    const r = await costMiddleware.complete(req(), { executor: exec }); // tekrar miss
    expect(r.cacheHit).toBe(false);
    expect(calls()).toBe(2);
  });
});
