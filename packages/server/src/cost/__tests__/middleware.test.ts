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

  it('OpenAI-compatible cache_read tokens → baseline > actual (prompt-cache savings)', async () => {
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = false;
    costConfig.layers.promptCache = false;
    costConfig.layers.compression = false;

    // Executor reports cached prompt tokens (as OpenAI/Azure auto-caching would).
    const exec: Executor = async () => ({
      text: 'r', inputTokens: 100, outputTokens: 20,
      cacheCreationInputTokens: 0, cacheReadInputTokens: 900, stopReason: 'stop',
    });
    const req = baseReq({ model: 'gpt-4o-mini', providerKind: 'openai-compatible', pricing: { costPer1kInput: 1, costPer1kOutput: 1 } });
    const res = await costMiddleware.complete(req, { executor: exec });

    // baseline treats all 1000 input as full price; actual discounts the 900 cached → cheaper.
    expect(res.baselineCostUsd).toBeGreaterThan(res.actualCostUsd);
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

  it('custom openai-compatible provider → maliyet custom fiyatla ÖLÇÜLÜR, L2/L3 atlanır', async () => {
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = true;
    costConfig.layers.promptCache = true;

    const { exec, calls } = fakeExecutor();
    // DeepSeek benzeri: providerKind + custom pricing taşınır (kayıt edenin çözdüğü).
    await costMiddleware.complete(
      baseReq({
        model: 'deepseek-chat',
        providerId: 'deepseek',
        providerKind: 'openai-compatible',
        pricing: { costPer1kInput: 0.001, costPer1kOutput: 0.002 },
      }),
      { executor: exec, classify: async () => ({ text: 'COMPLEX', inputTokens: 5, outputTokens: 1 }) },
    );

    const stats = costMetrics.getStats();
    // 100 in * 0.001/1K + 20 out * 0.002/1K = 0.0001 + 0.00004 = 0.00014
    expect(stats.session.cost.actualUsd).toBeCloseTo(0.00014, 8);
    expect(calls[0].systemBlocks).toBeUndefined(); // L3 yok
    expect(stats.recent[0].routerTier).toBeNull(); // L2 yok
  });

  it('non-anthropic model → L3 (prompt cache) atlanır ama maliyet ÖLÇÜLÜR; karmaşık iş modelde kalır', async () => {
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = true;
    costConfig.layers.promptCache = true;

    const { exec, calls } = fakeExecutor();
    // Complexity 10 → router keeps the requested model (no downgrade).
    await costMiddleware.complete(baseReq({ model: 'gpt-4o' }), {
      executor: exec,
      classify: async () => ({ text: '10', inputTokens: 10, outputTokens: 1 }),
    });

    const stats = costMetrics.getStats();
    expect(stats.session.cost.actualUsd).toBeGreaterThan(0); // built-in price → cost measured
    expect(calls[0].model).toBe('gpt-4o');                   // complex → kept
    expect(calls[0].systemBlocks).toBeUndefined();           // L3 anthropic-only
    expect(stats.recent[0].promptCacheApplied).toBe(false);
  });
});
