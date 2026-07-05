/**
 * Multimodal message content — shared shape for every hop of the inference path
 * (gateway → ClaudeService → cost middleware → unified client → provider).
 *
 * Wire shape follows the OpenAI vision convention so OpenAI-compatible providers
 * (DeepSeek, vLLM, Qwen, …) receive the parts array untouched:
 *   { type: 'text', text }
 *   { type: 'image_url', image_url: { url } }   url = data-URI or https URL
 *   { type: 'video_url', video_url: { url } }   same, for video-capable models
 *   { type: 'audio_url', audio_url: { url } }   same, for audio-capable models
 *     (OpenAI's official `input_audio` {data, format} is normalized to/from this
 *      shape at the gateway ingress and the OpenAI-compatible egress)
 */

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } }
  | { type: 'audio_url'; audio_url: { url: string } };

/** A message body: plain text (the overwhelmingly common case) or multimodal parts. */
export type MessageContent = string | ContentPart[];

/** Flatten a message body to its text — media parts contribute nothing. */
export function contentText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content.filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text').map((p) => p.text).join('');
}

/** True when any message carries non-text parts (image/video). */
export function hasMediaParts(messages: Array<{ content: MessageContent }>): boolean {
  return messages.some((m) => typeof m.content !== 'string' && m.content.some((p) => p.type !== 'text'));
}

/** Split a data-URI into media type + base64 payload; null for non-data URLs. */
export function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(url);
  return m ? { mediaType: m[1]!, data: m[2]! } : null;
}
