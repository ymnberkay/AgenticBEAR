import { useEffect, useId, useState } from 'react';
import { Play, Copy, Check, X, History } from 'lucide-react';
import { useToast } from '../ui/toast';

interface TaskRunnerProps {
  projectId: string;
}

const HISTORY_LIMIT = 8;

function historyKey(projectId: string) {
  return `task-runner-history:${projectId}`;
}

function readHistory(projectId: string): string[] {
  try {
    const raw = window.localStorage.getItem(historyKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeHistory(projectId: string, entries: string[]) {
  try {
    window.localStorage.setItem(historyKey(projectId), JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // ignore
  }
}

export function TaskRunner({ projectId }: TaskRunnerProps) {
  const [objective, setObjective] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const { show: showToast } = useToast();
  const textareaId = useId();

  useEffect(() => { setHistory(readHistory(projectId)); }, [projectId]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = objective.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setObjective('');
    const next = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, HISTORY_LIMIT);
    setHistory(next);
    writeHistory(projectId, next);
    setShowHistory(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  const handleCopy = async () => {
    if (!submitted) return;
    try {
      await navigator.clipboard.writeText(submitted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy. Select and copy manually.', { variant: 'error' });
    }
  };

  const handleReset = () => {
    setSubmitted(null);
    setCopied(false);
  };

  const charCount = objective.length;
  const tokenEstimate = Math.ceil(charCount / 4);

  // After submission: show the "say this in Claude" panel
  if (submitted) {
    return (
      <div
        style={{
          background: 'var(--color-bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border-default)',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{
            fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.1em', color: 'var(--color-text-disabled)',
          }}>
            Ready to Run
          </span>
          <button
            type="button"
            onClick={handleReset}
            aria-label="Start a new task"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 4 }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '10px', lineHeight: '1.5' }}>
          Open Claude Code CLI and say:
        </p>

        <div
          style={{
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border-subtle)',
            padding: '10px 12px',
            fontSize: '12.5px',
            color: 'var(--color-text-primary)',
            lineHeight: '1.6',
            marginBottom: '10px',
          }}
        >
          {submitted}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy task'}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              height: '32px', padding: '0 12px',
              background: copied ? 'rgba(107,191,160,0.15)' : 'var(--color-bg-raised)',
              color: copied ? '#6db58a' : 'var(--color-text-primary)',
              fontSize: '11px', fontWeight: 500,
              border: `1px solid ${copied ? 'rgba(107,191,160,0.3)' : 'var(--color-border-subtle)'}`,
              cursor: 'pointer', transition: 'all 0.15s',
              borderRadius: 4,
            }}
          >
            {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
            <span aria-live="polite">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: '32px', padding: '0 12px',
              background: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            New task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-default)',
        padding: '16px 20px',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
        <span style={{
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--color-text-secondary)',
        }}>
          Orchestrate Task
        </span>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            aria-expanded={showHistory}
            aria-controls={`${textareaId}-history`}
            className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              fontSize: 10.5, fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 6px', borderRadius: 4,
            }}
          >
            <History style={{ width: 11, height: 11 }} aria-hidden="true" />
            recent ({history.length})
          </button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div
          id={`${textareaId}-history`}
          className="flex flex-col"
          style={{
            background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)', marginBottom: 10, maxHeight: 160, overflowY: 'auto',
          }}
        >
          {history.map((h, i) => (
            <button
              key={`${h}-${i}`}
              type="button"
              onClick={() => { setObjective(h); setShowHistory(false); }}
              className="text-left focus-visible:outline-none focus-visible:bg-[rgba(124,140,248,0.08)]"
              style={{
                padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)',
                borderBottom: i < history.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={textareaId}>Task objective</label>
        <textarea
          id={textareaId}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want the agent team to accomplish…"
          rows={3}
          aria-describedby={`${textareaId}-hint`}
          style={{
            width: '100%',
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            lineHeight: '1.6',
            padding: '10px 12px',
            resize: 'vertical',
            minHeight: 88,
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', gap: 12 }}>
          <span id={`${textareaId}-hint`} style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            <kbd aria-label="Cmd or Ctrl Enter" style={{ background: 'var(--color-bg-raised)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--color-border-subtle)' }}>⌘↵</kbd> to run · {charCount} chars · ~{tokenEstimate} tok
          </span>
          <button
            type="submit"
            disabled={!objective.trim()}
            aria-label="Run task"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              height: '36px', padding: '0 16px', borderRadius: 'var(--radius-md)',
              background: objective.trim() ? 'var(--color-accent)' : 'var(--color-bg-raised)',
              color: objective.trim() ? '#021526' : 'var(--color-text-disabled)',
              fontSize: '12.5px', fontWeight: 600,
              border: 'none',
              cursor: objective.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Run
          </button>
        </div>
      </form>
    </div>
  );
}
