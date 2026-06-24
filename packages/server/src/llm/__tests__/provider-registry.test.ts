import { describe, it, expect } from 'vitest';
import { detectBuiltinProvider, isAnthropicKind, modelPricing } from '../provider-registry.js';
import { CLAUDE_MODELS } from '@subagent/shared';

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
});
