import { useState } from 'react';
import { Loader2, Wrench, FileEdit, ArrowRightLeft, FileSearch, Terminal, Copy, Check } from 'lucide-react';
import { Markdown } from './markdown';
import type { ChatEntry } from './use-conversations';

/** Pick an icon for an activity line (matches the present-tense labels from activityLine). */
function ActivityIcon({ line }: { line: string }) {
  const s = { width: 12, height: 12, flexShrink: 0 } as const;
  if (/^(Writing|Editing|Deleting|Proposing|Documenting)/.test(line)) return <FileEdit style={{ ...s, color: 'var(--color-warning)' }} aria-hidden="true" />;
  if (/^Delegating/.test(line)) return <ArrowRightLeft style={{ ...s, color: 'var(--color-accent)' }} aria-hidden="true" />;
  if (/^(Reading|Listing)/.test(line)) return <FileSearch style={{ ...s, color: 'var(--color-text-secondary)' }} aria-hidden="true" />;
  if (/^Running[:\s]/.test(line) || /^Running a command/.test(line)) return <Terminal style={{ ...s, color: 'var(--color-success)' }} aria-hidden="true" />;
  return <Wrench style={{ ...s, color: 'var(--color-text-secondary)' }} aria-hidden="true" />;
}

interface Props {
  entry: ChatEntry;
  agentName: string;
  agentColor: string;
  streaming?: boolean;
}

export function ChatMessage({ entry, agentName, agentColor, streaming }: Props) {
  const isUser = entry.role === 'user';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!entry.content) return;
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col group" style={{ gap: 7, maxWidth: 760, width: '100%', margin: '0 auto' }}>
      {/* Author label */}
      <div className="flex items-center gap-2" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
        {isUser ? (
          <span style={{ color: 'var(--color-text-secondary)' }}>You</span>
        ) : (
          <>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: agentColor, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{agentName}</span>
          </>
        )}
        {entry.content && !streaming && (
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Message copied' : 'Copy message'}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)', padding: 4, borderRadius: 4,
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)',
            }}
          >
            {copied ? <Check style={{ width: 11, height: 11 }} aria-hidden="true" /> : <Copy style={{ width: 11, height: 11 }} aria-hidden="true" />}
            <span aria-live="polite">{copied ? 'copied' : 'copy'}</span>
          </button>
        )}
      </div>

      {/* Tool / agent activity (assistant only). The last step shows a live spinner while the
          turn is still running and no final text has arrived yet — i.e. work is ongoing. */}
      {!isUser && entry.activity && entry.activity.length > 0 && (
        <div className="flex flex-col" style={{ gap: 4, marginBottom: 2 }}>
          {entry.activity.map((line, j) => {
            const isActive = !!streaming && !entry.content && j === entry.activity!.length - 1;
            return (
              <div
                key={j}
                title={line}
                className="flex items-center gap-2"
                style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', padding: '4px 9px', background: 'var(--color-bg-surface)', border: `1px solid ${isActive ? 'var(--glass-border-hover)' : 'var(--color-border-subtle)'}`, borderRadius: 'var(--radius-sm)', width: 'fit-content', maxWidth: '100%' }}
              >
                {isActive ? <Loader2 className="animate-spin" style={{ width: 12, height: 12, flexShrink: 0, color: 'var(--color-accent)' }} aria-hidden="true" /> : <ActivityIcon line={line} />}
                <span className="truncate">{line}{isActive ? '…' : ''}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      {isUser ? (
        <div style={{
          background: 'var(--color-accent-subtle)', border: '1px solid var(--glass-border-hover)',
          borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, lineHeight: 1.6,
          whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)', width: 'fit-content', maxWidth: '100%',
          wordBreak: 'break-word',
        }}>
          {entry.content}
        </div>
      ) : entry.content ? (
        <Markdown text={entry.content} />
      ) : streaming && (!entry.activity || entry.activity.length === 0) ? (
        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)', fontSize: 13 }} role="status" aria-live="polite">
          <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} aria-hidden="true" />
          <span style={{ fontFamily: 'var(--font-mono)' }}>thinking…</span>
        </div>
      ) : null}

      {/* Streaming cursor — shown while a response is mid-flight and content is not empty */}
      {!isUser && streaming && entry.content && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block', width: 7, height: 14,
            background: 'var(--color-accent)', verticalAlign: '-2px',
            marginTop: -8, animation: 'blink 1s step-end infinite',
          }}
        />
      )}
    </div>
  );
}
