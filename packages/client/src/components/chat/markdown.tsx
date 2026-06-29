import { useState } from 'react';
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Lightweight, dependency-free Markdown renderer tuned for LLM output.
 * Handles: fenced code (``` with copy), inline `code`, **bold**, *italic*,
 * # headings, - / * / 1. lists, > blockquote, [links](url), --- rules, paragraphs.
 */

const SAFE_URL = /^(https?:|mailto:|tel:|\/|#)/i;
/**
 * Reject non-http(s)/mailto/tel/relative URLs to block javascript:/data: XSS via LLM output.
 * Returns a safe href or `#` placeholder.
 */
function safeHref(href: string): string {
  const trimmed = href.trim();
  return SAFE_URL.test(trimmed) ? trimmed : '#';
}

const CODE_COLLAPSE_LINES = 40;

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lineCount = code.split('\n').length;
  const canCollapse = lineCount > CODE_COLLAPSE_LINES;
  const visibleCode = canCollapse && !expanded
    ? code.split('\n').slice(0, CODE_COLLAPSE_LINES).join('\n')
    : code;
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };
  return (
    <div style={{ margin: '10px 0', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-bg-inset)' }}>
      <div className="flex items-center justify-between" style={{ padding: '5px 10px', background: 'var(--color-bg-muted)', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>{lang || 'code'}</span>
        <div className="flex items-center gap-2">
          {canCollapse && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse code block' : 'Expand code block'}
              className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 10.5, fontFamily: 'var(--font-mono)', padding: '4px 6px', borderRadius: 4 }}
            >
              {expanded ? <ChevronUp style={{ width: 11, height: 11 }} aria-hidden="true" /> : <ChevronDown style={{ width: 11, height: 11 }} aria-hidden="true" />}
              {expanded ? `collapse (${lineCount} lines)` : `show all ${lineCount} lines`}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Code copied' : 'Copy code'}
            className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)', fontSize: 10.5, fontFamily: 'var(--font-mono)', padding: '4px 6px', borderRadius: 4 }}
          >
            {copied ? <Check style={{ width: 11, height: 11 }} aria-hidden="true" /> : <Copy style={{ width: 11, height: 11 }} aria-hidden="true" />}
            <span aria-live="polite">{copied ? 'copied' : 'copy'}</span>
          </button>
        </div>
      </div>
      <pre style={{ margin: 0, padding: '11px 12px', overflowX: 'auto', maxHeight: expanded ? 600 : undefined, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
        <code>{visibleCode}</code>
      </pre>
    </div>
  );
}

/** Inline formatting → React nodes: `code`, **bold**, *italic*, [text](url). */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Split on the earliest of the inline tokens, repeatedly.
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('`')) {
      out.push(<code key={key} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88em', background: 'var(--color-bg-inset)', border: '1px solid var(--color-border-subtle)', borderRadius: 3, padding: '1px 5px', color: 'var(--color-accent-hover)' }}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('**')) {
      out.push(<strong key={key} style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('*')) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (lm) out.push(
        <a
          key={key}
          href={safeHref(lm[2])}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-accent)', textDecoration: 'underline', wordBreak: 'break-word' }}
        >
          {lm[1]}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={`ol-${blocks.length}`} style={{ margin: '6px 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {L.items.map((it, k) => <li key={k} style={{ lineHeight: 1.6 }}>{renderInline(it, `oli-${blocks.length}-${k}`)}</li>)}
        </ol>
      ) : (
        <ul key={`ul-${blocks.length}`} style={{ margin: '6px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3, listStyle: 'disc' }}>
          {L.items.map((it, k) => <li key={k} style={{ lineHeight: 1.6 }}>{renderInline(it, `uli-${blocks.length}-${k}`)}</li>)}
        </ul>
      ),
    );
    list = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^```(\w+)?\s*$/.exec(line.trim());
    if (fence) {
      flushList();
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      blocks.push(<CodeBlock key={`code-${blocks.length}`} code={buf.join('\n')} lang={lang} />);
      continue;
    }

    // Heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const size = [18, 16, 14.5, 13][level - 1];
      blocks.push(
        <div key={`h-${blocks.length}`} style={{ fontSize: size, fontWeight: 600, color: 'var(--color-text-primary)', margin: '12px 0 4px', lineHeight: 1.3 }}>
          {renderInline(h[2], `h-${blocks.length}`)}
        </div>,
      );
      i++; continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} style={{ border: 'none', borderTop: '1px solid var(--color-border-subtle)', margin: '12px 0' }} />);
      i++; continue;
    }

    // Blockquote
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      flushList();
      blocks.push(
        <blockquote key={`bq-${blocks.length}`} style={{ borderLeft: '3px solid var(--color-accent-muted)', paddingLeft: 12, margin: '8px 0', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
          {renderInline(bq[1], `bq-${blocks.length}`)}
        </blockquote>,
      );
      i++; continue;
    }

    // List items
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      const item = (ul ? ul[1] : ol![1]);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(item);
      i++; continue;
    }

    // Blank line → paragraph break
    if (line.trim() === '') { flushList(); i++; continue; }

    // Paragraph (gather consecutive non-special lines)
    flushList();
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i].trim()) && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} style={{ margin: '4px 0', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
        {renderInline(para.join('\n'), `p-${blocks.length}`)}
      </p>,
    );
  }
  flushList();

  return <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{blocks}</div>;
}
