import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedProvider } from '../provider-registry.js';

// Mock the registry so the client can be tested without DB/settings.
// Keep the real pure auth-header helpers; only resolveProvider hits the DB.
const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }));
vi.mock('../provider-registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../provider-registry.js')>()),
  resolveProvider: resolveMock,
}));

// The rate limiter reads settings from the DB — stub it to a no-op for this unit test.
vi.mock('../../services/rate-limiter.service.js', () => ({
  acquire: vi.fn(async () => () => {}),
  modelTimeoutMs: vi.fn(async () => undefined),
}));

import { complete } from '../client.js';

function mockFetchOnce(jsonBody: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(jsonBody), { status: ok ? status : status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => resolveMock.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('unified client — OpenAI-compatible (DeepSeek / local)', () => {
  it('calls {baseUrl}/chat/completions with Bearer key and normalizes usage', async () => {
    resolveMock.mockReturnValue({
      providerId: 'deepseek',
      label: 'DeepSeek',
      kind: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
    } satisfies ResolvedProvider);

    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: 'merhaba' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 123, completion_tokens: 45 },
    });

    const res = await complete({
      providerId: 'deepseek',
      model: 'deepseek-chat',
      maxTokens: 1000,
      temperature: 0.2,
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'selam' }],
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');

    expect(res.text).toBe('merhaba');
    expect(res.inputTokens).toBe(123);
    expect(res.outputTokens).toBe(45);
    expect(res.cacheReadInputTokens).toBe(0);
    expect(res.providerKind).toBe('openai-compatible');
  });

  it('local provider without key → no Authorization header', async () => {
    resolveMock.mockReturnValue({
      providerId: 'ollama', label: 'Ollama', kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1', apiKey: '',
    });
    const fetchMock = mockFetchOnce({ choices: [{ message: { content: 'ok' } }], usage: {} });

    await complete({ model: 'llama3.1:8b', providerId: 'ollama', maxTokens: 256, messages: [{ role: 'user', content: 'hi' }] });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('non-ok response → throws', async () => {
    resolveMock.mockReturnValue({ providerId: 'deepseek', label: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'k' });
    mockFetchOnce({ error: 'bad' }, false, 401);
    await expect(
      complete({ model: 'deepseek-chat', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/401/);
  });
});

describe('unified client — Gemini', () => {
  it('normalizes usageMetadata token counts', async () => {
    resolveMock.mockReturnValue({ providerId: 'gemini', label: 'gemini', kind: 'gemini', apiKey: 'g-key' });
    const fetchMock = mockFetchOnce({
      candidates: [{ content: { parts: [{ text: 'yanıt' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
    });

    const res = await complete({ model: 'gemini-1.5-pro', providerId: 'gemini', maxTokens: 100, messages: [{ role: 'user', content: 'q' }] });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('/models/gemini-1.5-pro:generateContent');
    expect(res.text).toBe('yanıt');
    expect(res.inputTokens).toBe(12);
    expect(res.outputTokens).toBe(7);
    expect(res.providerKind).toBe('gemini');
  });
});
