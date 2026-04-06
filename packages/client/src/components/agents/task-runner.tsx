import { useState } from 'react';
import { Play, Copy, Check, X } from 'lucide-react';

interface TaskRunnerProps {
  projectId: string;
}

export function TaskRunner({ projectId: _projectId }: TaskRunnerProps) {
  const [objective, setObjective] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = objective.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setObjective('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  const handleCopy = () => {
    if (!submitted) return;
    navigator.clipboard.writeText(submitted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setSubmitted(null);
    setCopied(false);
  };

  // After submission: show the "say this in Claude" panel
  if (submitted) {
    return (
      <div
        style={{
          background: 'var(--color-bg-card)',
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
            onClick={handleReset}
            style={{ color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
          >
            <X className="h-3.5 w-3.5" />
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
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              height: '30px', padding: '0 12px',
              background: copied ? 'rgba(107,191,160,0.15)' : 'var(--color-bg-raised)',
              color: copied ? '#8ec07c' : 'var(--color-text-secondary)',
              fontSize: '11px', fontWeight: 500,
              border: `1px solid ${copied ? 'rgba(107,191,160,0.3)' : 'var(--color-border-subtle)'}`,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleReset}
            style={{
              height: '30px', padding: '0 12px',
              background: 'none',
              color: 'var(--color-text-disabled)',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
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
        border: '1px solid var(--color-border-default)',
        padding: '16px 20px',
      }}
    >
      <div style={{
        fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--color-text-disabled)', marginBottom: '10px',
      }}>
        Orchestrate Task
      </div>

      <form onSubmit={handleSubmit}>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want the agent team to accomplish…"
          rows={3}
          style={{
            width: '100%',
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            lineHeight: '1.6',
            padding: '10px 12px',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>⌘↵ to continue</span>
          <button
            type="submit"
            disabled={!objective.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              height: '34px', padding: '0 16px',
              background: objective.trim() ? 'white' : 'var(--color-bg-raised)',
              color: objective.trim() ? '#0a0a0a' : 'var(--color-text-disabled)',
              fontSize: '12.5px', fontWeight: 600,
              border: 'none',
              cursor: objective.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </button>
        </div>
      </form>
    </div>
  );
}
