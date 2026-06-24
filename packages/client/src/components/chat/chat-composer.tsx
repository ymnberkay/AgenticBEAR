import { useEffect, useRef } from 'react';
import { Send, Mic, Square, Paperclip, Loader2 } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { useVoice } from './use-voice';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  streaming: boolean;
  agents: Agent[];
  agentId: string;
  onAgentChange: (id: string) => void;
}

/** Claude-style composer: auto-growing field with voice dictation, attach, agent picker, send. */
export function ChatComposer({ value, onChange, onSend, onAttach, streaming, agents, agentId, onAgentChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Voice dictation appends finalized chunks to the field.
  const voice = useVoice((finalText) => onChange((value ? `${value} ` : '') + finalText));

  const autosize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };
  useEffect(autosize, [value]);

  const canSend = !streaming && !!value.trim();
  const shownValue = voice.interim ? `${value}${value ? ' ' : ''}${voice.interim}` : value;

  return (
    <div
      style={{
        border: `1px solid ${voice.listening ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
        borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-surface)',
        boxShadow: voice.listening ? '0 0 0 3px var(--color-accent-subtle)' : 'var(--shadow-sm)',
        transition: 'border-color .15s, box-shadow .15s', overflow: 'hidden',
      }}
    >
      <textarea
        ref={ref}
        value={shownValue}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) onSend(); } }}
        placeholder={voice.listening ? 'Listening…' : 'Message your agent, or 🎤 dictate by voice… (Enter to send)'}
        rows={1}
        style={{
          width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent',
          padding: '13px 14px 4px', fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)', maxHeight: 220, overflowY: 'auto',
        }}
      />
      <div className="flex items-center justify-between" style={{ padding: '6px 8px 7px 10px' }}>
        <div className="flex items-center gap-1.5">
          {/* Agent picker */}
          <select value={agentId} onChange={(e) => onAgentChange(e.target.value)}
            style={{ height: 28, maxWidth: 200, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '0 6px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', outline: 'none' }}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.role === 'orchestrator' ? '◆ ' : '• '}{a.name}</option>
            ))}
          </select>
          {onAttach && (
            <button type="button" onClick={onAttach} title="Attach knowledge document"
              className="flex items-center justify-center"
              style={{ width: 28, height: 28, background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
              <Paperclip style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Voice */}
          {voice.supported && (
            <button type="button" onClick={voice.toggle} title={voice.listening ? 'Stop' : 'Voice dictation'}
              className="flex items-center justify-center"
              style={{
                width: 30, height: 30, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: voice.listening ? 'var(--color-accent)' : 'none',
                border: `1px solid ${voice.listening ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                color: voice.listening ? '#0d1117' : 'var(--color-text-secondary)',
                animation: voice.listening ? 'agbpulse 1.4s ease-in-out infinite' : 'none',
              }}>
              {voice.listening ? <Square style={{ width: 13, height: 13 }} /> : <Mic style={{ width: 15, height: 15 }} />}
            </button>
          )}
          {/* Send */}
          <button type="button" onClick={onSend} disabled={!canSend} title="Send"
            className="flex items-center justify-center"
            style={{
              width: 32, height: 30, borderRadius: 'var(--radius-sm)', border: 'none',
              background: canSend ? 'var(--color-accent)' : 'var(--color-bg-raised)',
              color: canSend ? '#0d1117' : 'var(--color-text-disabled)',
              cursor: canSend ? 'pointer' : 'default', transition: 'background .15s',
            }}>
            {streaming ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Send style={{ width: 15, height: 15 }} />}
          </button>
        </div>
      </div>
    </div>
  );
}
