import { describe, it, expect } from 'vitest';
import { contentText, hasMediaParts, parseDataUrl, type ContentPart } from '../content.js';
import { splitMessages } from '../../routes/gateway.js';
import { isCompressible } from '../../cost/layers/compression.js';
import { isCacheable } from '../../cost/layers/semantic-cache.js';
import { isRoutable } from '../../cost/layers/router.js';
import type { LlmRequest } from '../../cost/types.js';

const IMG = { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,aGk=' } };
const VID = { type: 'video_url' as const, video_url: { url: 'https://cdn.example.com/clip.mp4' } };
const AUD = { type: 'audio_url' as const, audio_url: { url: 'data:audio/wav;base64,aGk=' } };

describe('llm/content helpers', () => {
  it('contentText flattens text parts and ignores media', () => {
    expect(contentText('hello')).toBe('hello');
    expect(contentText([{ type: 'text', text: 'a' }, IMG, { type: 'text', text: 'b' }])).toBe('ab');
  });

  it('hasMediaParts detects image/video anywhere in the history', () => {
    expect(hasMediaParts([{ content: 'hi' }])).toBe(false);
    expect(hasMediaParts([{ content: [{ type: 'text', text: 'hi' }] }])).toBe(false);
    expect(hasMediaParts([{ content: 'hi' }, { content: [IMG] }])).toBe(true);
    expect(hasMediaParts([{ content: [VID] }])).toBe(true);
    expect(hasMediaParts([{ content: [AUD] }])).toBe(true);
  });

  it('parseDataUrl splits media type and base64 payload; plain URLs → null', () => {
    expect(parseDataUrl('data:image/png;base64,aGk=')).toEqual({ mediaType: 'image/png', data: 'aGk=' });
    expect(parseDataUrl('https://example.com/x.png')).toBeNull();
  });
});

describe('gateway — splitMessages (multimodal)', () => {
  it('keeps image, video and audio parts on user turns', () => {
    const { turns } = splitMessages([
      { role: 'user', content: [{ type: 'text', text: 'describe this' }, IMG, VID, AUD] },
    ]);
    expect(turns).toHaveLength(1);
    const parts = turns[0]!.content as ContentPart[];
    expect(parts.map((p) => p.type)).toEqual(['text', 'image_url', 'video_url', 'audio_url']);
  });

  it("normalizes OpenAI's input_audio {data, format} to an audio_url data-URI", () => {
    const { turns } = splitMessages([
      { role: 'user', content: [{ type: 'text', text: 'transcribe' }, { type: 'input_audio', input_audio: { data: 'aGk=', format: 'mp3' } }] },
    ]);
    const parts = turns[0]!.content as ContentPart[];
    expect(parts[1]).toEqual({ type: 'audio_url', audio_url: { url: 'data:audio/mp3;base64,aGk=' } });
  });

  it('collapses text-only part arrays back to a plain string', () => {
    const { turns } = splitMessages([
      { role: 'user', content: [{ type: 'text', text: 'just ' }, { type: 'text', text: 'text' }] },
    ]);
    expect(turns[0]!.content).toBe('just text');
  });

  it('system messages contribute text only', () => {
    const { systemPrompt, turns } = splitMessages([
      { role: 'system', content: [{ type: 'text', text: 'be brief' }, IMG] },
      { role: 'user', content: 'hi' },
    ]);
    expect(systemPrompt).toBe('be brief');
    expect(turns).toEqual([{ role: 'user', content: 'hi' }]);
  });
});

describe('cost layers — media requests bypass L0/L1/L2', () => {
  const req = (content: LlmRequest['messages'][number]['content']): LlmRequest => ({
    model: 'deepseek-v4-pro',
    maxTokens: 100,
    messages: [{ role: 'user', content }],
    meta: { cacheable: true },
  });

  it('media → not compressible, not cacheable, not routable', () => {
    const r = req([{ type: 'text', text: 'what is in this image?' }, IMG]);
    expect(isCompressible(r)).toBe(false);
    expect(isCacheable(r)).toBe(false);
    expect(isRoutable(r)).toBe(false);
  });

  it('plain text keeps the existing behavior', () => {
    const r = req('what is 2+2?');
    expect(isCompressible(r)).toBe(true);
    expect(isCacheable(r)).toBe(true);
    expect(isRoutable(r)).toBe(true);
  });
});
