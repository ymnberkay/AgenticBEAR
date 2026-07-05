/**
 * Section on the Agents page listing external agents (team-built HTTP proxies).
 * Own list because their metadata is quite different from specialists.
 */
import { Plug, Plus, Image as ImageIcon, Mic, Film, Zap } from 'lucide-react';
import type { Agent } from '@subagent/shared';

export function ExternalAgentList({ agents, onAdd, onEdit }: {
  agents: Agent[] | undefined;
  onAdd: () => void;
  onEdit: (a: Agent) => void;
}) {
  const externals = (agents ?? []).filter((a) => a.role === 'external');
  return (
    <section>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          <Plug style={{ width: 14, height: 14, color: '#c0a0d8' }} aria-hidden="true" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            External agents · {externals.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 30, padding: '0 12px', fontSize: 11.5, fontWeight: 600,
            color: '#021526', background: 'var(--color-accent)', border: 'none',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}
        >
          <Plus style={{ width: 12, height: 12 }} /> New external
        </button>
      </div>

      {externals.length === 0 ? (
        <div style={{
          padding: '24px 20px', textAlign: 'center',
          background: 'var(--color-bg-surface)', border: '1px dashed var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(192,160,216,0.12)', border: '1px solid rgba(192,160,216,0.3)', marginBottom: 10 }}>
            <Plug style={{ width: 16, height: 16, color: '#c0a0d8' }} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', marginBottom: 4 }}>No external agents yet</div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            Plug in a team-built OpenAI-compatible endpoint (vision, RAG, doc processing…) and chat with it directly.
          </div>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {externals.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onEdit(a)}
              className="flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                padding: '12px 14px',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(192,160,216,0.45)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                <span aria-hidden="true" style={{
                  width: 26, height: 26, borderRadius: 7,
                  background: `linear-gradient(135deg, ${a.color || '#c0a0d8'}30, ${a.color || '#c0a0d8'}0d)`,
                  border: `1px solid ${a.color || '#c0a0d8'}55`,
                  color: a.color || '#c0a0d8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Plug style={{ width: 12, height: 12 }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={a.name}>
                  {a.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                {a.external?.supportsImages && <span className="flex items-center gap-1" style={{ color: '#7c8cf8' }}><ImageIcon style={{ width: 10, height: 10 }} /> images</span>}
                {a.external?.supportsAudio && <span className="flex items-center gap-1" style={{ color: '#d8a0c0' }}><Mic style={{ width: 10, height: 10 }} /> audio</span>}
                {a.external?.supportsVideo && <span className="flex items-center gap-1" style={{ color: '#8fd4a0' }}><Film style={{ width: 10, height: 10 }} /> video</span>}
                {a.external?.supportsStreaming && <span className="flex items-center gap-1" style={{ color: '#6db58a' }}><Zap style={{ width: 10, height: 10 }} /> streaming</span>}
                {a.external?.authType && a.external.authType !== 'none' && <span>{a.external.authType}</span>}
              </div>
              {a.external?.endpointUrl && (
                <code style={{ marginTop: 6, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={a.external.endpointUrl}>
                  {a.external.endpointUrl}
                </code>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
