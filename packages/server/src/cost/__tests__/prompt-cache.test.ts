import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as promptCache from '../layers/prompt-cache.js';
import { costMiddleware } from '../middleware.js';
import { costConfig } from '../config.js';
import { costMetrics } from '../metrics.js';
import type { Executor, ExecutorResult, FinalRequest, LlmRequest } from '../types.js';

const LARGE_SYSTEM = 'A'.repeat(9000); // ~2250 token > Sonnet 2048 eşiği
const SMALL_SYSTEM = 'You are helpful.';

function req(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0,
    systemPrompt: LARGE_SYSTEM,
    messages: [{ role: 'user', content: 'Q' }],
    meta: {},
    ...overrides,
  };
}

describe('L3 — prompt-cache.apply', () => {
  it('büyük prefiks → son system bloğuna cache_control: ephemeral konur', () => {
    const out = promptCache.apply(req(), { model: 'claude-sonnet-4-20250514', maxTokens: 8192 });
    expect(out.systemBlocks).toBeDefined();
    expect(out.systemBlocks).toHaveLength(1);
    const last = out.systemBlocks![out.systemBlocks!.length - 1];
    expect(last.type).toBe('text');
    expect(last.text).toBe(LARGE_SYSTEM);
    expect(last.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('küçük prefiks → L3 atlanır (systemBlocks yok, düz systemPrompt kalır)', () => {
    const out = promptCache.apply(req({ systemPrompt: SMALL_SYSTEM }), {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
    });
    expect(out.systemBlocks).toBeUndefined();
    expect(out.systemPrompt).toBe(SMALL_SYSTEM);
  });

  it('model bazlı min eşik: Opus 4096, Sonnet 2048', () => {
    // ~2250 token: Sonnet için yeterli, Opus için yetersiz
    expect(promptCache.shouldCachePrefix('claude-sonnet-4-20250514', LARGE_SYSTEM)).toBe(true);
    expect(promptCache.shouldCachePrefix('claude-opus-4-6', LARGE_SYSTEM)).toBe(false);
  });
});

describe('L3 — middleware entegrasyonu', () => {
  let saved: typeof costConfig.layers;
  beforeEach(() => {
    saved = { ...costConfig.layers };
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = false;
    costConfig.layers.promptCache = true;
    costMetrics.reset();
  });
  afterEach(() => Object.assign(costConfig.layers, saved));

  function fakeExec(results: Partial<ExecutorResult>[]) {
    const calls: FinalRequest[] = [];
    let i = 0;
    const exec: Executor = async (r) => {
      calls.push(r);
      const base: ExecutorResult = {
        text: 'ok',
        inputTokens: 50,
        outputTokens: 10,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        stopReason: 'end_turn',
      };
      return { ...base, ...(results[i++] ?? {}) };
    };
    return { exec, calls };
  }

  it('büyük system + anthropic → executor systemBlocks alır, metrik promptCacheApplied=true', async () => {
    const { exec, calls } = fakeExec([{}]);
    await costMiddleware.complete(req(), { executor: exec });
    expect(calls[0].systemBlocks).toBeDefined();
    expect(calls[0].systemBlocks![0].cache_control).toEqual({ type: 'ephemeral' });
    expect(costMetrics.getStats().recent[0].promptCacheApplied).toBe(true);
  });

  it('non-anthropic model → L3 uygulanmaz', async () => {
    const { exec, calls } = fakeExec([{}]);
    await costMiddleware.complete(req({ model: 'gpt-4o' }), { executor: exec });
    expect(calls[0].systemBlocks).toBeUndefined();
    expect(costMetrics.getStats().recent[0].promptCacheApplied).toBe(false);
  });

  it('2. çağrıda cache_read_input_tokens > 0 ve gerçek maliyet baseline’dan düşük', async () => {
    // 1. çağrı: prefiks yazılır (cache_creation). 2. çağrı: prefiks okunur (cache_read).
    const { exec } = fakeExec([
      { inputTokens: 50, cacheCreationInputTokens: 2200, cacheReadInputTokens: 0 },
      { inputTokens: 50, cacheCreationInputTokens: 0, cacheReadInputTokens: 2200 },
    ]);

    await costMiddleware.complete(req(), { executor: exec });
    await costMiddleware.complete(req(), { executor: exec });

    const stats = costMetrics.getStats();
    expect(stats.session.calls).toBe(2);
    // recent[0] = en son çağrı (reverse'li)
    expect(stats.recent[0].cacheReadInputTokens).toBe(2200);
    expect(stats.session.tokens.cacheRead).toBe(2200);
    expect(stats.session.tokens.cacheCreation).toBe(2200);
    // cache_read girdi fiyatının ~%10'u → toplam gerçek maliyet baseline'ın altında
    expect(stats.session.cost.actualUsd).toBeLessThan(stats.session.cost.baselineUsd);
    expect(stats.session.cost.savedUsd).toBeGreaterThan(0);
  });
});
