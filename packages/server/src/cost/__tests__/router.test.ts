import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as router from '../layers/router.js';
import { costMiddleware } from '../middleware.js';
import { costConfig } from '../config.js';
import { costMetrics } from '../metrics.js';
import type { Classifier, Executor, FinalRequest, LlmRequest } from '../types.js';

const CHEAP = 'claude-haiku-4-5-20251001';
const MAIN = 'claude-sonnet-4-20250514';

function req(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: MAIN,
    maxTokens: 8192,
    temperature: 0,
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: 'Bir todo uygulaması yaz' }],
    meta: {},
    ...overrides,
  };
}

/** Verilen tek kelimeyi döndüren sahte sınıflandırıcı. */
function classifierReturning(word: string, input = 40, output = 1): Classifier {
  return async () => ({ text: word, inputTokens: input, outputTokens: output });
}

describe('L2 — router.parseTier', () => {
  it('üç kademeyi tanır', () => {
    expect(router.parseTier('TRIVIAL')).toBe('TRIVIAL');
    expect(router.parseTier('simple')).toBe('SIMPLE');
    expect(router.parseTier('COMPLEX')).toBe('COMPLEX');
  });
  it('tanınmayan çıktı → güvenli COMPLEX', () => {
    expect(router.parseTier('banana')).toBe('COMPLEX');
    expect(router.parseTier('')).toBe('COMPLEX');
  });
});

describe('L2 — router.decide', () => {
  it('TRIVIAL → cheapModel + düşük max_tokens', async () => {
    const d = await router.decide(req(), classifierReturning('TRIVIAL'));
    expect(d.model).toBe(CHEAP);
    expect(d.maxTokens).toBe(Math.min(8192, costConfig.router.trivialMaxTokens));
    expect(d.tier).toBe('TRIVIAL');
    expect(d.overheadTokens).toBe(41);
    expect(d.overheadCostUsd).toBeGreaterThan(0);
  });

  it('SIMPLE → cheapModel, max_tokens korunur', async () => {
    const d = await router.decide(req(), classifierReturning('SIMPLE'));
    expect(d.model).toBe(CHEAP);
    expect(d.maxTokens).toBe(8192);
    expect(d.tier).toBe('SIMPLE');
  });

  it('COMPLEX → ana model korunur', async () => {
    const d = await router.decide(req(), classifierReturning('COMPLEX'));
    expect(d.model).toBe(MAIN);
    expect(d.tier).toBe('COMPLEX');
  });

  it('tanınmayan çıktı → fallback ana model (COMPLEX), downgrade yok', async () => {
    const d = await router.decide(req(), classifierReturning('???'));
    expect(d.model).toBe(MAIN);
    expect(d.tier).toBe('COMPLEX');
  });

  it('sınıflandırma hata fırlatırsa → istenen modelde kal (tier null, overhead 0)', async () => {
    const boom: Classifier = async () => {
      throw new Error('classify down');
    };
    const d = await router.decide(req(), boom);
    expect(d.model).toBe(MAIN);
    expect(d.tier).toBeNull();
    expect(d.overheadTokens).toBe(0);
  });

  it('classify yoksa → no-op (istenen model)', async () => {
    const d = await router.decide(req());
    expect(d.model).toBe(MAIN);
    expect(d.tier).toBeNull();
  });
});

describe('L2 — middleware entegrasyonu', () => {
  let saved: typeof costConfig.layers;
  beforeEach(() => {
    saved = { ...costConfig.layers };
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = true;
    costConfig.layers.promptCache = false;
    costMetrics.reset();
  });
  afterEach(() => Object.assign(costConfig.layers, saved));

  function fakeExec() {
    const calls: FinalRequest[] = [];
    const exec: Executor = async (r) => {
      calls.push(r);
      return {
        text: 'ok',
        inputTokens: 30,
        outputTokens: 5,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        stopReason: 'end_turn',
      };
    };
    return { exec, calls };
  }

  it('SIMPLE → executor cheapModel alır; metrik tier + overhead kaydeder', async () => {
    const { exec, calls } = fakeExec();
    await costMiddleware.complete(req(), { executor: exec, classify: classifierReturning('SIMPLE', 40, 1) });

    expect(calls[0].model).toBe(CHEAP);
    const stats = costMetrics.getStats();
    expect(stats.recent[0].routerTier).toBe('SIMPLE');
    expect(stats.recent[0].servedModel).toBe(CHEAP);
    expect(stats.recent[0].requestedModel).toBe(MAIN);
    expect(stats.session.routerTierCounts.SIMPLE).toBe(1);
    expect(stats.session.tokens.routerOverhead).toBe(41);
    expect(stats.session.cost.actualUsd).toBeGreaterThan(0);
  });

  it('COMPLEX → ana model korunur, executor MAIN alır', async () => {
    const { exec, calls } = fakeExec();
    await costMiddleware.complete(req(), { executor: exec, classify: classifierReturning('COMPLEX') });
    expect(calls[0].model).toBe(MAIN);
    expect(costMetrics.getStats().recent[0].routerTier).toBe('COMPLEX');
  });

  it('non-anthropic istek → router atlanır (model değişmez)', async () => {
    const { exec, calls } = fakeExec();
    await costMiddleware.complete(req({ model: 'gpt-4o' }), {
      executor: exec,
      classify: classifierReturning('TRIVIAL'),
    });
    expect(calls[0].model).toBe('gpt-4o');
    expect(costMetrics.getStats().recent[0].routerTier).toBeNull();
  });

  it('callKind=routing → router atlanır (sınıflandırma kendisi route edilmez)', async () => {
    const { exec, calls } = fakeExec();
    await costMiddleware.complete(req({ meta: { callKind: 'routing' } }), {
      executor: exec,
      classify: classifierReturning('TRIVIAL'),
    });
    expect(calls[0].model).toBe(MAIN);
    expect(costMetrics.getStats().recent[0].routerTier).toBeNull();
  });
});
