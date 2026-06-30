import { useEffect, useId, useRef } from 'react';
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
  const textareaId = useId();
  const agentSelectId = useId();

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

  // Auto-paste hint: if the user pastes more than ~5000 chars, surface a tip about Knowledge.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (text.length > 5000 && onAttach) {
      // Don't block the paste; just emit a console hint and onAttach button gets a glow via aria.
      ref.current?.setAttribute('aria-describedby', `${textareaId}-large-paste-hint`);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${voice.listening ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
        borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-surface)',
        boxShadow: voice.listening ? '0 0 0 3px var(--color-accent-subtle)' : 'var(--shadow-sm)',
        transition: 'border-color .15s, box-shadow .15s', overflow: 'hidden',
      }}
    >
      <label htmlFor={textareaId} className="sr-only">Message your agent</label>
      <textarea
        ref={ref}
        id={textareaId}
        value={shownValue}
        disabled={streaming}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={streaming ? 'Agent is working… please wait' : voice.listening ? 'Listening…' : 'Message your agent · Enter to send · Shift+Enter for newline'}
        rows={1}
        aria-label="Message"
        aria-disabled={streaming || undefined}
        style={{
          width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent',
          padding: '13px 14px 4px', fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)', maxHeight: 220, overflowY: 'auto',
          cursor: streaming ? 'not-allowed' : 'text', opacity: streaming ? 0.6 : 1,
        }}
      />
      <div className="flex items-center justify-between" style={{ padding: '6px 8px 7px 10px' }}>
        <div className="flex items-center gap-1.5">
          {/* Agent picker */}
          <label htmlFor={agentSelectId} className="sr-only">Active agent</label>
          <select
            id={agentSelectId}
            value={agentId}
            disabled={streaming}
            onChange={(e) => onAgentChange(e.target.value)}
            title={agents.find((a) => a.id === agentId)?.name}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 32, maxWidth: 200, background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '0 8px', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', outline: 'none', textOverflow: 'ellipsis',
            }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.role === 'orchestrator' ? '◆ ' : '• '}{a.name}</option>
            ))}
          </select>
          {onAttach && (
            <button
              type="button"
              onClick={onAttach}
              aria-label="Attach knowledge document"
              title="Attach knowledge document"
              className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ width: 32, height: 32, background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            >
              <Paperclip style={{ width: 14, height: 14 }} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Voice */}
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              aria-label={voice.listening ? 'Stop voice dictation' : 'Start voice dictation'}
              aria-pressed={voice.listening}
              title={voice.listening ? 'Stop' : 'Voice dictation'}
              className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                width: 32, height: 32, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: voice.listening ? 'var(--color-accent)' : 'none',
                border: `1px solid ${voice.listening ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                color: voice.listening ? '#021526' : 'var(--color-text-secondary)',
                animation: voice.listening ? 'agbpulse 1.4s ease-in-out infinite' : 'none',
              }}
            >
              {voice.listening ? <Square style={{ width: 13, height: 13 }} aria-hidden="true" /> : <Mic style={{ width: 15, height: 15 }} aria-hidden="true" />}
            </button>
          )}
          {/* Send */}
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            aria-busy={streaming || undefined}
            title="Send (Enter)"
            className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              width: 36, height: 32, borderRadius: 'var(--radius-sm)', border: 'none',
              background: canSend ? 'var(--color-accent)' : 'var(--color-bg-raised)',
              color: canSend ? '#021526' : 'var(--color-text-disabled)',
              cursor: canSend ? 'pointer' : 'not-allowed', transition: 'background .15s',
            }}
          >
            {streaming ? (
              <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} aria-hidden="true" />
            ) : (
              <Send style={{ width: 15, height: 15 }} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
