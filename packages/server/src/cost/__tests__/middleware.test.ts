import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { costMiddleware } from '../middleware.js';
import { costConfig } from '../config.js';
import { costMetrics } from '../metrics.js';
import type { Executor, FinalRequest, LlmRequest } from '../types.js';

function baseReq(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.7,
    systemPrompt: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'Hello' }],
    meta: {},
    ...overrides,
  };
}

function fakeExecutor() {
  const calls: FinalRequest[] = [];
  const exec: Executor = async (req) => {
    calls.push(req);
    return {
      text: 'response',
      inputTokens: 100,
      outputTokens: 20,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      stopReason: 'end_turn',
    };
  };
  return { exec, calls };
}

describe('cost middleware — skeleton (Adım 2)', () => {
  let savedLayers: typeof costConfig.layers;

  beforeEach(() => {
    savedLayers = { ...costConfig.layers };
    costMetrics.reset();
  });

  afterEach(() => {
    Object.assign(costConfig.layers, savedLayers);
  });

  it('tüm katmanlar KAPALI → executor isteği birebir alır, dönüşüm yok', async () => {
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = false;
    costConfig.layers.promptCache = false;

    const { exec, calls } = fakeExecutor();
    const req = baseReq();
    const res = await costMiddleware.complete(req, { executor: exec });

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(req.model);
    expect(calls[0].maxTokens).toBe(req.maxTokens);
    expect(calls[0].temperature).toBe(req.temperature);
    expect(calls[0].systemPrompt).toBe(req.systemPrompt);
    expect(calls[0].messages).toEqual(req.messages);
    // L3 devre dışı → blok dizisi üretilmez
    expect(calls[0].systemBlocks).toBeUndefined();

    expect(res.servedModel).toBe(req.model);
    expect(res.cacheHit).toBe(false);
    expect(res.text).toBe('response');
  });

  it('tüm katmanlar AÇIK (no-op skeleton) → istek yine birebir, model değişmez', async () => {
    costConfig.layers.semanticCache = true;
    costConfig.layers.router = true;
    costConfig.layers.promptCache = true;

    const { exec, calls } = fakeExecutor();
    const req = baseReq();
    await costMiddleware.complete(req, { executor: exec });

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(req.model);
    expect(calls[0].maxTokens).toBe(req.maxTokens);
    expect(calls[0].systemPrompt).toBe(req.systemPrompt);
    expect(calls[0].systemBlocks).toBeUndefined();
  });

  it('metrikler gerçek usage ile kaydedilir; baseline ≥ actual', async () => {
    const { exec } = fakeExecutor();
    await costMiddleware.complete(baseReq(), { executor: exec });

    const stats = costMetrics.getStats();
    expect(stats.session.calls).toBe(1);
    expect(stats.session.tokens.input).toBe(100);
    expect(stats.session.tokens.output).toBe(20);
    expect(stats.session.semanticCacheMisses).toBe(1);
    expect(stats.session.cost.baselineUsd).toBeGreaterThanOrEqual(stats.session.cost.actualUsd);
    expect(stats.recent).toHaveLength(1);
    expect(stats.recent[0].requestedModel).toBe('claude-sonnet-4-20250514');
  });

  it('non-anthropic model → cost katmanı maliyeti 0 raporlar (gate)', async () => {
    const { exec } = fakeExecutor();
    await costMiddleware.complete(baseReq({ model: 'gpt-4o' }), { executor: exec });
    const stats = costMetrics.getStats();
    expect(stats.session.cost.actualUsd).toBe(0);
    expect(stats.session.cost.baselineUsd).toBe(0);
  });
});
