import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Copy, Check, Search, X } from 'lucide-react';
import { useRunStore } from '../../stores/run.store';
import { cn } from '../../lib/cn';

interface StreamingOutputProps {
  className?: string;
}

// Minimal ANSI SGR → CSS; covers the common foreground/background/style codes that CLI tools emit.
const ANSI_REGEX = /\x1b\[([\d;]*)m/g;
const ANSI_COLORS: Record<string, string> = {
  '30': '#1f2937', '31': '#e06060', '32': '#6db58a', '33': '#e2b04a',
  '34': '#7c8cf8', '35': '#c0a0d8', '36': '#7cd1e0', '37': '#d6d3d1',
  '90': '#637070', '91': '#f08585', '92': '#90c8a3', '93': '#f0c870',
  '94': '#a0aef9', '95': '#d3bce5', '96': '#a0e0ed', '97': '#fafafa',
};

interface Segment { text: string; color?: string; background?: string; bold?: boolean; italic?: boolean; underline?: boolean; }

function parseAnsi(input: string): Segment[] {
  if (!input.includes('\x1b')) return [{ text: input }];
  const segments: Segment[] = [];
  let last = 0;
  let state: Segment = { text: '' };
  let m: RegExpExecArray | null;
  ANSI_REGEX.lastIndex = 0;
  while ((m = ANSI_REGEX.exec(input)) !== null) {
    if (m.index > last) segments.push({ ...state, text: input.slice(last, m.index) });
    const codes = (m[1] ?? '').split(';').filter(Boolean);
    if (codes.length === 0) {
      state = { text: '' };
    } else {
      for (const c of codes) {
        if (c === '0') state = { text: '' };
        else if (c === '1') state = { ...state, bold: true };
        else if (c === '3') state = { ...state, italic: true };
        else if (c === '4') state = { ...state, underline: true };
        else if (c === '22') state = { ...state, bold: false };
        else if (c === '23') state = { ...state, italic: false };
        else if (c === '24') state = { ...state, underline: false };
        else if (ANSI_COLORS[c]) state = { ...state, color: ANSI_COLORS[c] };
        else if (c.length === 3 && c.startsWith('4') && ANSI_COLORS[`3${c[1]}${c[2]}`]) {
          state = { ...state, background: ANSI_COLORS[`3${c[1]}${c[2]}`] };
        } else if (c === '39') state = { ...state, color: undefined };
        else if (c === '49') state = { ...state, background: undefined };
      }
    }
    last = m.index + m[0].length;
  }
  if (last < input.length) segments.push({ ...state, text: input.slice(last) });
  return segments;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function StreamingOutput({ className }: StreamingOutputProps) {
  const output = useRunStore((s) => s.streamingOutput);
  const isStreaming = useRunStore((s) => s.isStreaming);
  const containerRef = useRef<HTMLDivElement>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Smart auto-scroll: only follow new output when the user is near the bottom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !autoScroll) return;
    el.scrollTop = el.scrollHeight;
  }, [output, autoScroll]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distance < 100);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
  }, []);

  const copyAll = useCallback(async () => {
    if (!output) return;
    try {
      // Strip ANSI for clipboard so users get clean text.
      await navigator.clipboard.writeText(output.replace(ANSI_REGEX, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [output]);

  const segments = useMemo(() => parseAnsi(output ?? ''), [output]);

  // Highlight search matches by splitting the rendered text.
  const rendered = useMemo(() => {
    const query = search.trim();
    if (!query) {
      return segments.map((seg, i) => (
        <span key={i} style={segmentStyle(seg)}>{seg.text}</span>
      ));
    }
    const re = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return segments.map((seg, segIdx) => {
      const parts = seg.text.split(re);
      return (
        <span key={segIdx} style={segmentStyle(seg)}>
          {parts.map((part, partIdx) => (
            re.test(part)
              ? <mark key={partIdx} style={{ background: 'rgba(226,176,74,0.4)', color: 'inherit', borderRadius: 2 }}>{part}</mark>
              : <span key={partIdx}>{part}</span>
          ))}
        </span>
      );
    });
  }, [segments, search]);

  if (!output && !isStreaming) return null;

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{
        maxHeight: 400,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        className="sticky top-0 flex items-center justify-between gap-2 px-4 py-2 z-10"
        style={{
          background: 'rgba(7, 13, 20, 0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
          Live Output
        </span>
        <div className="flex items-center gap-2 flex-1 justify-end">
          {searchOpen && (
            <div style={{ position: 'relative' }}>
              <Search aria-hidden="true" style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 11, height: 11, color: 'var(--color-text-secondary)' }} />
              <label htmlFor="streaming-output-search" className="sr-only">Search output</label>
              <input
                id="streaming-output-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                autoFocus
                style={{
                  height: 24, paddingLeft: 22, paddingRight: 22, fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-text-primary)', borderRadius: 4, outline: 'none', width: 160,
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); }}
                  aria-label="Clear search"
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 2 }}
                >
                  <X style={{ width: 10, height: 10 }} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen((v) => { if (v) setSearch(''); return !v; })}
            aria-label={searchOpen ? 'Close search' : 'Search output'}
            aria-pressed={searchOpen}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: searchOpen ? '#7c8cf8' : 'var(--color-text-secondary)', padding: 4, borderRadius: 4, display: 'inline-flex' }}
          >
            <Search style={{ width: 12, height: 12 }} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={copyAll}
            aria-label={copied ? 'Output copied' : 'Copy output'}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: copied ? '#6db58a' : 'var(--color-text-secondary)',
              padding: 4, borderRadius: 4, display: 'inline-flex',
            }}
          >
            {copied ? <Check style={{ width: 12, height: 12 }} aria-hidden="true" /> : <Copy style={{ width: 12, height: 12 }} aria-hidden="true" />}
          </button>
          {isStreaming && (
            <span className="flex items-center gap-1.5" role="status" aria-live="polite">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#7c8cf8] animate-pulse" />
              <span className="text-[10px] text-[#7c8cf8] font-medium">Streaming</span>
            </span>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{ maxHeight: 360, overflowY: 'auto' }}
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        <pre className="p-4 font-mono text-[12px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words overflow-x-hidden">
          {rendered}
          {isStreaming && (
            <span aria-hidden="true" className="inline-block w-[6px] h-[14px] bg-[#7c8cf8]/70 animate-cursor-blink ml-px align-middle" />
          )}
        </pre>
      </div>
      {!autoScroll && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Jump to latest output"
          className="absolute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            bottom: 12, right: 12,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 28, padding: '0 12px',
            background: 'var(--color-bg-surface)',
            border: '1px solid rgba(124,140,248,0.4)',
            color: 'var(--color-accent)',
            borderRadius: 999, fontSize: 11, fontFamily: 'var(--font-mono)',
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <ArrowDown style={{ width: 11, height: 11 }} aria-hidden="true" /> Latest
        </button>
      )}
    </div>
  );
}

function segmentStyle(seg: Segment): React.CSSProperties {
  return {
    color: seg.color,
    background: seg.background,
    fontWeight: seg.bold ? 700 : undefined,
    fontStyle: seg.italic ? 'italic' : undefined,
    textDecoration: seg.underline ? 'underline' : undefined,
  };
}
