import { describe, it, expect } from 'vitest';
import {
  detectBuiltinProvider,
  isAnthropicKind,
  modelPricing,
  anthropicClientOptions,
  applyOpenAiAuthHeaders,
  type ResolvedProvider,
} from '../provider-registry.js';
import { CLAUDE_MODELS } from '@subagent/shared';

const base = (over: Partial<ResolvedProvider>): ResolvedProvider => ({
  providerId: 'p', label: 'P', kind: 'anthropic-compatible', apiKey: 'k', ...over,
});

describe('provider-registry — pure helpers', () => {
  it('detectBuiltinProvider: id heuristic for legacy agents', () => {
    expect(detectBuiltinProvider('claude-sonnet-4-20250514')).toBe('anthropic');
    expect(detectBuiltinProvider('gemini-1.5-pro')).toBe('gemini');
    expect(detectBuiltinProvider('gpt-4o')).toBe('openai');
    expect(detectBuiltinProvider('deepseek-chat')).toBe('openai'); // default bucket
  });

  it('isAnthropicKind: only native + anthropic-compatible', () => {
    expect(isAnthropicKind('anthropic')).toBe(true);
    expect(isAnthropicKind('anthropic-compatible')).toBe(true);
    expect(isAnthropicKind('openai')).toBe(false);
    expect(isAnthropicKind('openai-compatible')).toBe(false);
    expect(isAnthropicKind('gemini')).toBe(false);
  });

  it('modelPricing: known built-in models resolve from CLAUDE_MODELS (no DB)', async () => {
    const sonnet = CLAUDE_MODELS['claude-sonnet-4-20250514'];
    expect(await modelPricing(undefined, 'claude-sonnet-4-20250514')).toEqual({
      costPer1kInput: sonnet.costPer1kInput,
      costPer1kOutput: sonnet.costPer1kOutput,
    });
  });

  it('modelPricing: unknown model with no/builtin provider → zero (no DB)', async () => {
    expect(await modelPricing(undefined, 'totally-unknown')).toEqual({ costPer1kInput: 0, costPer1kOutput: 0 });
    expect(await modelPricing('anthropic', 'totally-unknown')).toEqual({ costPer1kInput: 0, costPer1kOutput: 0 });
  });

  describe('anthropicClientOptions — flexible auth (Team/Enterprise gateways)', () => {
    it('default (api_key) → sends apiKey, never authToken', () => {
      const opts = anthropicClientOptions(base({ apiKey: 'sk-ant', baseUrl: 'https://gw/v1' }));
      expect(opts.apiKey).toBe('sk-ant');
      expect(opts.authToken).toBeUndefined();
      expect(opts.baseURL).toBe('https://gw/v1');
    });

    it('bearer → sends only authToken so no conflicting x-api-key is emitted', () => {
      const opts = anthropicClientOptions(base({ authType: 'bearer', apiKey: 'tok' }));
      expect(opts.authToken).toBe('tok');
      expect(opts.apiKey).toBeUndefined();
    });

    it('passes custom headers through as defaultHeaders', () => {
      const opts = anthropicClientOptions(base({ headers: { 'anthropic-beta': 'x', 'x-org': 'acme' } }));
      expect(opts.defaultHeaders).toEqual({ 'anthropic-beta': 'x', 'x-org': 'acme' });
    });
  });

  describe('applyOpenAiAuthHeaders', () => {
    it('sets Bearer + merges custom headers; custom wins on conflict', () => {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      applyOpenAiAuthHeaders(base({ kind: 'openai-compatible', apiKey: 'sk', headers: { 'x-route': 'eu', Authorization: 'Bearer override' } }), h);
      expect(h['x-route']).toBe('eu');
      expect(h.Authorization).toBe('Bearer override'); // custom header overrides the default Bearer
    });

    it('no key → no Authorization header', () => {
      const h: Record<string, string> = {};
      applyOpenAiAuthHeaders(base({ kind: 'openai-compatible', apiKey: '' }), h);
      expect(h.Authorization).toBeUndefined();
    });
  });
});
