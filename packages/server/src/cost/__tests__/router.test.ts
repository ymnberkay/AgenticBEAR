import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as router from '../layers/router.js';
import { parseComplexity, selectForComplexity, defaultLevel, type Candidate } from '../layers/model-select.js';
import { costMiddleware } from '../middleware.js';
import { costConfig } from '../config.js';
import { costMetrics } from '../metrics.js';
import type { Classifier, Executor, FinalRequest, LlmRequest } from '../types.js';

const SONNET = 'claude-sonnet-4-20250514'; // level ~6 (router picks the cheapest level≤6 Claude for simple tasks)

function req(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: SONNET,
    providerKind: 'anthropic',
    maxTokens: 8192,
    temperature: 0,
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: 'Bir todo uygulaması yaz' }],
    meta: {},
    ...overrides,
  };
}

/** Fake classifier returning a fixed complexity number. */
function classifierReturning(n: number | string, input = 40, output = 1): Classifier {
  return async () => ({ text: String(n), inputTokens: input, outputTokens: output });
}

describe('L0/core — model-select', () => {
  it('parseComplexity reads 1-10, clamps, defaults to 10 when unparseable', () => {
    expect(parseComplexity('2')).toBe(2);
    expect(parseComplexity('complexity: 8/10')).toBe(8);
    expect(parseComplexity('99')).toBe(10);
    expect(parseComplexity('banana')).toBe(10);
  });

  it('defaultLevel ranks weak<strong by name', () => {
    expect(defaultLevel('gpt-5.4-nano')).toBeLessThan(defaultLevel('gpt-5.4'));
    expect(defaultLevel('claude-haiku')).toBeLessThan(defaultLevel('claude-opus'));
  });

  it('selectForComplexity picks cheapest meeting complexity, capped by the requested level', () => {
    const pool: Candidate[] = [
      { model: 'nano', catalogId: 'nano', owner: 'x', level: 2, price: 0.1 },
      { model: 'mini', catalogId: 'mini', owner: 'x', level: 5, price: 0.5 },
      { model: 'big', catalogId: 'big', owner: 'x', level: 8, price: 5 },
    ];
    // requested = big (ceiling 8), complexity 3 → cheapest with level∈[3,8] → mini.
    expect(selectForComplexity(pool, { model: 'big' }, 3)).toMatchObject({ model: 'mini', downgraded: true });
    // complexity 8 → only big qualifies → keep big.
    expect(selectForComplexity(pool, { model: 'big' }, 8)).toMatchObject({ model: 'big', downgraded: false });
    // requested = mini (ceiling 5), complexity 1 → cheapest level∈[1,5] → nano.
    expect(selectForComplexity(pool, { model: 'mini' }, 1)).toMatchObject({ model: 'nano', downgraded: true });
  });
});

describe('L2 — router.decide (level-based, built-in anthropic family)', () => {
  it('low complexity → downgrades to a cheaper model', async () => {
    const d = await router.decide(req(), classifierReturning(1));
    expect(d.model).not.toBe(SONNET);
    expect(defaultLevel(d.model)).toBeLessThanOrEqual(defaultLevel(SONNET));
    expect(d.tier).toBe('TRIVIAL');
    expect(d.maxTokens).toBe(Math.min(8192, costConfig.router.trivialMaxTokens));
    expect(d.overheadTokens).toBe(41);
    expect(d.overheadCostUsd).toBeGreaterThan(0);
  });

  it('complexity above the requested level → keep requested (COMPLEX)', async () => {
    const d = await router.decide(req(), classifierReturning(10));
    expect(d.model).toBe(SONNET);
    expect(d.tier).toBe('COMPLEX');
  });

  it('classify throws → keep requested, tier null, no overhead', async () => {
    const boom: Classifier = async () => { throw new Error('classify down'); };
    const d = await router.decide(req(), boom);
    expect(d.model).toBe(SONNET);
    expect(d.tier).toBeNull();
    expect(d.overheadTokens).toBe(0);
  });

  it('no classifier → no-op (keep requested)', async () => {
    const d = await router.decide(req());
    expect(d.model).toBe(SONNET);
    expect(d.tier).toBeNull();
  });
});

describe('L2 — middleware integration', () => {
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
      return { text: 'ok', inputTokens: 30, outputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, stopReason: 'end_turn' };
    };
    return { exec, calls };
  }

  it('simple → executor gets a cheaper model; metric records tier + overhead', async () => {
    const { exec, calls } = fakeExec();
    await costMiddleware.complete(req(), { executor: exec, classify: classifierReturning(1, 40, 1) });
    expect(calls[0].model).not.toBe(SONNET);
    const stats = costMetrics.getStats();
    expect(stats.recent[0].servedModel).not.toBe(SONNET);
    expect(stats.recent[0].requestedModel).toBe(SONNET);
    expect(stats.session.tokens.routerOverhead).toBe(41);
  });

  it('hard → keeps requested model', async () => {
    const { exec, calls } = fakeExec();
    await costMiddleware.complete(req(), { executor: exec, classify: classifierReturning(10) });
    expect(calls[0].model).toBe(SONNET);
    expect(costMetrics.getStats().recent[0].routerTier).toBe('COMPLEX');
  });

  it('callKind=routing → router skipped', async () => {
    const { exec, calls } = fakeExec();
    await costMiddleware.complete(req({ meta: { callKind: 'routing' } }), { executor: exec, classify: classifierReturning(1) });
    expect(calls[0].model).toBe(SONNET);
    expect(costMetrics.getStats().recent[0].routerTier).toBeNull();
  });
});
