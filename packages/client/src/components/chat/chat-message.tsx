import { Loader2, Wrench, FileEdit, ArrowRightLeft, FileSearch } from 'lucide-react';
import { Markdown } from './markdown';
import type { ChatEntry } from './use-conversations';

/** Pick an icon for an activity line by its leading marker. */
function ActivityIcon({ line }: { line: string }) {
  const s = { width: 12, height: 12, flexShrink: 0 } as const;
  if (line.includes('wrote') || line.includes('edited')) return <FileEdit style={{ ...s, color: 'var(--color-warning)' }} />;
  if (line.startsWith('→') || line.includes('delegated')) return <ArrowRightLeft style={{ ...s, color: 'var(--color-accent)' }} />;
  if (line.includes('read') || line.includes('listed')) return <FileSearch style={{ ...s, color: 'var(--color-text-tertiary)' }} />;
  return <Wrench style={{ ...s, color: 'var(--color-text-tertiary)' }} />;
}

interface Props {
  entry: ChatEntry;
  agentName: string;
  agentColor: string;
  streaming?: boolean;
}

export function ChatMessage({ entry, agentName, agentColor, streaming }: Props) {
  const isUser = entry.role === 'user';

  return (
    <div className="flex flex-col" style={{ gap: 7, maxWidth: 760, width: '100%', margin: '0 auto' }}>
      {/* Author label */}
      <div className="flex items-center gap-2" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
        {isUser ? (
          <span style={{ color: 'var(--color-text-secondary)' }}>You</span>
        ) : (
          <>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: agentColor, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{agentName}</span>
          </>
        )}
      </div>

      {/* Tool / agent activity (assistant only) */}
      {!isUser && entry.activity && entry.activity.length > 0 && (
        <div className="flex flex-col" style={{ gap: 4, marginBottom: 2 }}>
          {entry.activity.map((line, j) => (
            <div key={j} className="flex items-center gap-2"
              style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', padding: '4px 9px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', width: 'fit-content', maxWidth: '100%' }}>
              <ActivityIcon line={line} />
              <span className="truncate">{line.replace(/^[^\w\s]+\s?/, '')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {isUser ? (
        <div style={{
          background: 'var(--color-accent-subtle)', border: '1px solid var(--glass-border-hover)',
          borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, lineHeight: 1.6,
          whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)', width: 'fit-content', maxWidth: '100%',
        }}>
          {entry.content}
        </div>
      ) : entry.content ? (
        <Markdown text={entry.content} />
      ) : streaming ? (
        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
          <span style={{ fontFamily: 'var(--font-mono)' }}>thinking…</span>
        </div>
      ) : null}
    </div>
  );
}
