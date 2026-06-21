import { describe, it, expect } from 'vitest';
import { parseModelRef } from '../gateway.js';

describe('gateway — parseModelRef', () => {
  it('bare built-in model id → no providerId (registry heuristic resolves it)', () => {
    expect(parseModelRef('claude-sonnet-4-20250514')).toEqual({ model: 'claude-sonnet-4-20250514' });
    expect(parseModelRef('gpt-4o')).toEqual({ model: 'gpt-4o' });
  });

  it('builtin-provider prefix → split into providerId + model', () => {
    expect(parseModelRef('anthropic/claude-sonnet-4-20250514')).toEqual({
      providerId: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
    expect(parseModelRef('openai/gpt-4o')).toEqual({ providerId: 'openai', model: 'gpt-4o' });
    expect(parseModelRef('gemini/gemini-2.5-flash')).toEqual({ providerId: 'gemini', model: 'gemini-2.5-flash' });
  });

  it('unknown first segment (no DB match) → treated as a bare model id', () => {
    // 'meta-llama' is not a builtin provider id and no DB in unit test → whole string is the model
    expect(parseModelRef('meta-llama-3.1-8b')).toEqual({ model: 'meta-llama-3.1-8b' });
  });
});
