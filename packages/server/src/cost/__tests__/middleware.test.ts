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

  it('non-anthropic model → L2/L3 atlanır ama maliyet ÖLÇÜLÜR (built-in fiyat)', async () => {
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = true;
    costConfig.layers.promptCache = true;

    const { exec, calls } = fakeExecutor();
    await costMiddleware.complete(baseReq({ model: 'gpt-4o' }), {
      executor: exec,
      classify: async () => ({ text: 'TRIVIAL', inputTokens: 10, outputTokens: 1 }),
    });

    const stats = costMetrics.getStats();
    // gpt-4o CLAUDE_MODELS'ta tanımlı → gerçek maliyet > 0 (artık 0 değil)
    expect(stats.session.cost.actualUsd).toBeGreaterThan(0);
    // L3 uygulanmadı, router downgrade etmedi (gpt-4o anthropic ailesi değil)
    expect(calls[0].systemBlocks).toBeUndefined();
    expect(stats.recent[0].routerTier).toBeNull();
    expect(stats.recent[0].promptCacheApplied).toBe(false);
  });
});
