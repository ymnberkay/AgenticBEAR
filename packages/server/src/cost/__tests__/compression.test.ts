import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compress, compressText, compressLossless, compressToolOutput } from '../layers/compression.js';
import { costMiddleware } from '../middleware.js';
import { costConfig } from '../config.js';
import { costMetrics } from '../metrics.js';
import * as semanticCache from '../layers/semantic-cache.js';
import type { CachePayload, Embedder, Executor, FinalRequest, LlmRequest, VectorStore } from '../types.js';

function req(content: string, overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0,
    systemPrompt: 'You are a helpful assistant. '.repeat(20),
    messages: [{ role: 'user', content }],
    meta: { cacheable: true },
    ...overrides,
  };
}

const PRETTY_JSON = `\`\`\`json\n${JSON.stringify({ a: 1, b: [1, 2, 3], c: { d: 'x' } }, null, 2)}\n\`\`\``;
const WHITESPACEY = `## Section\n\n\n\n${'data line   \n'.repeat(40)}\n\n\n\nend`;

describe('L0 — compressText (deterministic, safe)', () => {
  it('is deterministic (same in → same out)', () => {
    const input = `${WHITESPACEY}\n${PRETTY_JSON}`;
    expect(compressText(input)).toBe(compressText(input));
  });

  it('minifies JSON fences → shorter', () => {
    const input = `prefix to clear min-chars `.repeat(20) + PRETTY_JSON;
    const out = compressText(input);
    expect(out.length).toBeLessThan(input.length);
    expect(out).toContain('"b":[1,2,3]'); // minified, no spaces
  });

  it('collapses blank lines + trailing whitespace', () => {
    const out = compressText(WHITESPACEY);
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).not.toMatch(/[ \t]+\n/);
    expect(out.length).toBeLessThan(WHITESPACEY.length);
  });

  it('truncates oversized fenced blocks with a marker', () => {
    const huge = `\`\`\`\n${'x'.repeat(20000)}\n\`\`\``;
    const out = compressText(huge);
    expect(out.length).toBeLessThan(huge.length);
    expect(out).toContain('chars omitted');
  });

  it('leaves small content (< minChars) untouched', () => {
    const small = 'short message';
    expect(compressText(small)).toBe(small);
  });

  it('allowTruncate:false → never drops content (lossless for the agentic path)', () => {
    const huge = `\`\`\`\n${'x'.repeat(20000)}\n\`\`\``;
    const out = compressText(huge, { allowTruncate: false });
    expect(out).not.toContain('chars omitted');
    expect(out).toContain('x'.repeat(20000));
  });
});

describe('L0 — compressLossless (tool-use path)', () => {
  it('shrinks JSON/whitespace and reports saved tokens > 0', () => {
    const input = `pad pad pad `.repeat(30) + PRETTY_JSON + WHITESPACEY;
    const { text, savedTokens } = compressLossless(input);
    expect(text.length).toBeLessThan(input.length);
    expect(savedTokens).toBeGreaterThan(0);
  });

  it('leaves already-compact content alone (0 saved)', () => {
    const { savedTokens } = compressLossless('short compact message');
    expect(savedTokens).toBe(0);
  });
});

describe('L0 — RTK-style line dedup + tool-output compression', () => {
  it('gateway path (allowTruncate) collapses repeated lines; lossless path keeps them', () => {
    const repeated = `intro line padding padding padding `.repeat(20) + '\n' + 'ERROR: boom\n'.repeat(50);
    const gateway = compressText(repeated, { allowTruncate: true });
    const lossless = compressText(repeated, { allowTruncate: false });
    expect(gateway).toMatch(/×\d+⟫/);                 // dedup marker present
    expect(gateway.length).toBeLessThan(lossless.length);
    expect(lossless).not.toMatch(/×\d+⟫/);            // lossless never dedups
  });

  it('compressToolOutput dedups + truncates a huge listing', () => {
    const huge = Array.from({ length: 600 }, (_, i) => `src/module${i}/file.ts`).join('\n');
    const { text, savedTokens } = compressToolOutput(huge);
    expect(text).toMatch(/satır kırpıldı/);          // head/tail truncation marker
    expect(text.length).toBeLessThan(huge.length);
    expect(savedTokens).toBeGreaterThan(0);
  });

  it('compressToolOutput leaves small output untouched', () => {
    expect(compressToolOutput('a.ts\nb.ts').text).toBe('a.ts\nb.ts');
  });
});

describe('L0 — compress(req)', () => {
  it('never touches systemPrompt (protects L3 prefix)', () => {
    const r = req(`${WHITESPACEY}${PRETTY_JSON}`);
    const out = compress(r);
    expect(out.req.systemPrompt).toBe(r.systemPrompt);
  });

  it('compresses message content and reports saved tokens', () => {
    const r = req(`pad pad pad `.repeat(30) + PRETTY_JSON + WHITESPACEY);
    const out = compress(r);
    expect(out.req.messages[0].content.length).toBeLessThan(r.messages[0].content.length);
    expect(out.originalTokens).toBeGreaterThanOrEqual(out.compressedTokens);
  });
});

// ── Middleware composition: L0 + flags + L1 ──
function fakeEmbedder(): Embedder {
  return {
    available: async () => true,
    embed: async (text: string) => {
      const v = new Array(8).fill(0);
      for (let i = 0; i < text.length; i++) v[i % 8] += text.charCodeAt(i);
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    },
  };
}
function memStore(): VectorStore {
  const points: Array<{ vector: number[]; payload: CachePayload }> = [];
  const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
  return {
    async ensureCollection() {},
    async upsert(p) { points.push({ vector: p.vector, payload: p.payload }); },
    async search(ns, vector, topK) {
      return points.filter((p) => p.payload.namespace === ns)
        .map((p) => ({ score: cos(vector, p.vector), payload: p.payload }))
        .sort((a, b) => b.score - a.score).slice(0, topK);
    },
    async findByHash(ns, hash) {
      return points.find((p) => p.payload.namespace === ns && p.payload.promptHash === hash)?.payload ?? null;
    },
    async deleteByNamespace() {},
  };
}
function fakeExec() {
  const calls: FinalRequest[] = [];
  const exec: Executor = async (r) => {
    calls.push(r);
    return { text: 'ok', inputTokens: 50, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, stopReason: 'end_turn' };
  };
  return { exec, calls };
}

describe('L0 — composition with the other layers', () => {
  let saved: typeof costConfig.layers;
  beforeEach(() => { saved = { ...costConfig.layers }; costMetrics.reset(); });
  afterEach(() => {
    Object.assign(costConfig.layers, saved);
    semanticCache.__setBackendsForTest({ embedder: null, store: null });
  });

  it('flag OFF → executor receives the original (uncompressed) messages', async () => {
    costConfig.layers.compression = false;
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = false;
    costConfig.layers.promptCache = false;
    const { exec, calls } = fakeExec();
    const r = req(WHITESPACEY + PRETTY_JSON);
    await costMiddleware.complete(r, { executor: exec });
    expect(calls[0].messages[0].content).toBe(r.messages[0].content);
  });

  it('flag ON → executor receives compressed messages + metric records saved tokens', async () => {
    costConfig.layers.compression = true;
    costConfig.layers.semanticCache = false;
    costConfig.layers.router = false;
    costConfig.layers.promptCache = false;
    const { exec, calls } = fakeExec();
    const r = req(WHITESPACEY + PRETTY_JSON);
    await costMiddleware.complete(r, { executor: exec });
    expect(calls[0].messages[0].content.length).toBeLessThan(r.messages[0].content.length);
    expect(costMetrics.getStats().session.tokens.compressionSaved).toBeGreaterThan(0);
  });

  it('L0 + L1 → 2nd identical call still HITS the cache (deterministic compression)', async () => {
    costConfig.layers.compression = true;
    costConfig.layers.semanticCache = true;
    costConfig.layers.router = false;
    costConfig.layers.promptCache = false;
    semanticCache.__setBackendsForTest({ embedder: fakeEmbedder(), store: memStore() });
    const { exec } = fakeExec();
    const r = () => req(WHITESPACEY + PRETTY_JSON, { meta: { cacheable: true, role: 'specialist', agentSlug: 'x' } });

    const r1 = await costMiddleware.complete(r(), { executor: exec });
    const r2 = await costMiddleware.complete(r(), { executor: exec });
    expect(r1.cacheHit).toBe(false);
    expect(r2.cacheHit).toBe(true);
  });
});
