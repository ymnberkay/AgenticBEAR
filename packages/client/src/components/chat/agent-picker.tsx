import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Agent } from '@subagent/shared';

interface AgentPickerProps {
  agents: Agent[];
  agentId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

const roleTag = (a: Agent) => (a.role === 'orchestrator' ? 'orchestrator' : a.role === 'external' ? 'external' : 'specialist');

/**
 * Chat-header agent picker: a rounded pill showing the active agent (color dot + name + role),
 * opening a keyboard-navigable dropdown. Replaces the old <select> that lived in the composer.
 */
export function AgentPicker({ agents, agentId, onChange, disabled }: AgentPickerProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const active = agents.find((a) => a.id === agentId);

  // Outside click / Escape close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    if (open) setHighlight(Math.max(0, agents.findIndex((a) => a.id === agentId)));
  }, [open, agents, agentId]);

  const pick = (id: string) => { onChange(id); setOpen(false); };

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(agents.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const a = agents[highlight]; if (a) pick(a.id); }
  };

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative" style={{ flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={active ? `Active agent: ${active.name}` : 'Pick an agent'}
        className="flex items-center gap-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          height: 34, padding: '0 14px 0 12px', borderRadius: 999,
          background: open ? 'var(--color-bg-raised)' : 'var(--color-bg-surface)',
          border: `1px solid ${open ? 'var(--glass-border-hover)' : 'var(--color-border-subtle)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
          maxWidth: 280,
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 9, height: 9, borderRadius: '50%', background: active?.color ?? 'var(--color-accent)', flexShrink: 0, boxShadow: `0 0 6px ${active?.color ?? 'var(--color-accent)'}55` }}
        />
        <span className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
          {active?.name ?? 'Pick an agent'}
        </span>
        {active && (
          <span style={{ fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
            {roleTag(active)}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          style={{ width: 13, height: 13, color: 'var(--color-text-secondary)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Agents"
          tabIndex={-1}
          onKeyDown={onListKey}
          className="absolute animate-fade-in focus-visible:outline-none"
          style={{
            top: 'calc(100% + 6px)', left: 0, zIndex: 40, minWidth: 240, maxWidth: 320, maxHeight: 320,
            overflowY: 'auto', padding: 5,
            background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          {agents.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
              No agents yet — create one in the Agents tab.
            </div>
          )}
          {agents.map((a, i) => {
            const selected = a.id === agentId;
            const hl = i === highlight;
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(a.id)}
                onMouseEnter={() => setHighlight(i)}
                className="flex items-center gap-2.5 w-full text-left"
                style={{
                  padding: '8px 10px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
                  background: hl ? 'var(--color-bg-hover)' : 'transparent',
                  minHeight: 40,
                }}
              >
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: a.color || 'var(--color-accent)', flexShrink: 0 }} />
                <span className="flex flex-col min-w-0" style={{ flex: 1 }}>
                  <span className="truncate" style={{ fontSize: 12.5, fontWeight: selected ? 600 : 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                    {a.name}
                  </span>
                  <span style={{ fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                    {roleTag(a)}
                  </span>
                </span>
                {selected && <Check aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--color-accent)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
