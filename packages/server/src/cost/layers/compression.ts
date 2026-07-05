/**
 * L0 — Context Compression (headroom-style, but deterministic & loss-tolerant).
 *
 * Reduces INPUT tokens by shrinking the bulky variable context (file contents, dependency
 * outputs, knowledge) BEFORE the call — so it composes with L1/L2/L3:
 *   - deterministic (same input → same output) → L1 cache keys & L3 prefix stay stable;
 *   - touches ONLY message content, never `systemPrompt` (protects L3 prompt-cache prefix);
 *   - safe transforms only (whitespace/JSON minify + head/tail truncation), no neural/AST rewrite.
 */
import { costConfig } from '../config.js';
import { hasMediaParts } from '../../llm/content.js';
import { estimatePrefixTokens } from './prompt-cache.js';
import type { LlmRequest } from '../types.js';

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function tryMinifyJson(s: string): string | null {
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    return null;
  }
}

function truncateMiddle(s: string, cap: number): string {
  const head = Math.floor(cap * 0.7);
  const tail = Math.floor(cap * 0.2);
  const omitted = s.length - head - tail;
  if (omitted <= 0) return s;
  return `${s.slice(0, head)}\n…[${omitted} chars omitted]…\n${s.slice(s.length - tail)}`;
}

/** RTK-style: collapse runs of ≥3 identical consecutive lines into one + a count marker. */
function dedupeConsecutiveLines(text: string): string {
  if (!text.includes('\n')) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    let j = i + 1;
    while (j < lines.length && lines[j] === lines[i]) j++;
    const n = j - i;
    if (n >= 3) out.push(lines[i], `⟪… önceki satır ×${n}⟫`);
    else for (let k = 0; k < n; k++) out.push(lines[i]);
    i = j;
  }
  return out.join('\n');
}

/**
 * Deterministically compress one message's content.
 * `allowTruncate: false` → lossless mode (whitespace + JSON-minify only, never drop content),
 * used by the agentic tool-use path so file contents the agent is working on stay intact.
 * `allowTruncate: true` (gateway/middleware) also dedupes repeated lines + truncates huge blocks.
 */
export function compressText(content: string, opts: { allowTruncate?: boolean } = {}): string {
  const { minChars, maxBlockChars, jsonMinify } = costConfig.compression;
  const allowTruncate = opts.allowTruncate !== false;
  if (content.length < minChars) return content;

  // 1) Normalize whitespace (trailing spaces, runs of blank lines).
  let out = content.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  // 1b) Gateway/middleware path → collapse repeated lines (logs, dumps). Lossless agentic path skips.
  if (allowTruncate) out = dedupeConsecutiveLines(out);

  // 2) Per fenced block: minify JSON, truncate oversized blocks (unless lossless).
  out = out.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_m, lang: string, inner: string) => {
    let body = inner;
    if (jsonMinify && (/json/i.test(lang) || looksLikeJson(body))) {
      const min = tryMinifyJson(body);
      if (min !== null) body = `${min}\n`;
    }
    if (allowTruncate && body.length > maxBlockChars) body = `${truncateMiddle(body, maxBlockChars)}\n`;
    return `\`\`\`${lang}\n${body}\`\`\``;
  });

  // 3) Whole-content JSON (no fence).
  if (jsonMinify && looksLikeJson(out)) {
    const min = tryMinifyJson(out);
    if (min !== null) out = min;
  }

  return out;
}

export interface CompressionResult {
  req: LlmRequest;
  originalTokens: number;
  compressedTokens: number;
}

/** Compress the request's message content (system prompt left untouched). */
export function compress(req: LlmRequest): CompressionResult {
  let originalTokens = 0;
  let compressedTokens = 0;
  const messages = req.messages.map((m) => {
    if (typeof m.content !== 'string') return m; // multimodal parts pass through untouched
    const compressed = compressText(m.content);
    originalTokens += estimatePrefixTokens(m.content);
    compressedTokens += estimatePrefixTokens(compressed);
    return compressed === m.content ? m : { ...m, content: compressed };
  });
  return { req: { ...req, messages }, originalTokens, compressedTokens };
}

/** Should this request be compressed? Off when meta opts out or media (image/video) is attached. */
export function isCompressible(req: LlmRequest): boolean {
  return req.meta.compressible !== false && !hasMediaParts(req.messages);
}

/**
 * Lossless compression of one agentic message (no truncation), returning the new text and the
 * estimated input tokens saved. Used by the tool-use path, which bypasses the cost middleware
 * (and thus L1/L2/L3) but can still safely shrink whitespace/JSON before each call.
 */
export function compressLossless(content: string): { text: string; savedTokens: number } {
  if (!costConfig.layers.compression) return { text: content, savedTokens: 0 };
  const text = compressText(content, { allowTruncate: false });
  if (text === content) return { text, savedTokens: 0 };
  return { text, savedTokens: Math.max(0, estimatePrefixTokens(content) - estimatePrefixTokens(text)) };
}

/**
 * RTK-style aggressive compression for TOOL OUTPUT (listings, logs, command results) before it
 * re-enters the LLM context. Whitespace + repeated-line dedup + JSON minify + head/tail line
 * truncation when very long. Lossy-but-faithful (markers show what was collapsed/omitted).
 * Used by agentic file tools; safe because tool output is reference material, not verbatim code.
 */
export function compressToolOutput(text: string): { text: string; savedTokens: number } {
  if (!costConfig.toolOutputCompress || text.length < costConfig.compression.minChars) {
    return { text, savedTokens: 0 };
  }
  const { maxBlockChars, jsonMinify } = costConfig.compression;
  let out = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  out = dedupeConsecutiveLines(out);
  if (jsonMinify && looksLikeJson(out)) {
    const min = tryMinifyJson(out);
    if (min !== null) out = min;
  }
  // Head + tail when there are too many lines (e.g. a huge listing / log).
  const lines = out.split('\n');
  const maxLines = costConfig.toolOutputMaxLines;
  if (lines.length > maxLines) {
    const head = Math.floor(maxLines * 0.7);
    const tail = Math.floor(maxLines * 0.2);
    out = [...lines.slice(0, head), `⟪… ${lines.length - head - tail} satır kırpıldı …⟫`, ...lines.slice(lines.length - tail)].join('\n');
  }
  if (out.length > maxBlockChars) out = truncateMiddle(out, maxBlockChars);
  const savedTokens = Math.max(0, estimatePrefixTokens(text) - estimatePrefixTokens(out));
  return { text: out, savedTokens };
}
