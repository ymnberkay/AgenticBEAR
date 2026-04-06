import { Brain, Sparkles, Pencil, Check, Plus } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { CLAUDE_MODELS, AGENT_COLORS } from '@subagent/shared';
import type { AgentStatus } from './agent-card';

interface OrchestratorViewProps {
  orchestrator: Agent | undefined;
  status?: AgentStatus;
  onConfigure: () => void;
}

export function OrchestratorView({ orchestrator, status = 'idle', onConfigure }: OrchestratorViewProps) {
  const color = AGENT_COLORS.orchestrator;

  if (!orchestrator) {
    return (
      <div>
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            Orchestrator
          </span>
        </div>
        <button
          onClick={onConfigure}
          className="w-full text-left group"
          style={{
            border: '1px dashed var(--color-border-default)',
            borderLeft: '3px dashed var(--color-border-default)',
            padding: '18px 16px',
            background: 'transparent',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(250,189,47,0.4)';
            e.currentTarget.style.background = 'rgba(250,189,47,0.03)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div className="flex items-center gap-3">
            <Plus style={{ width: 14, height: 14, color: 'var(--color-text-disabled)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                No Orchestrator Configured
              </p>
              <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 2 }}>
                click to configure orchestrator
              </p>
            </div>
          </div>
        </button>
      </div>
    );
  }

  const modelLabel = CLAUDE_MODELS[orchestrator.modelConfig.model]?.label ?? orchestrator.modelConfig.model;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
          Orchestrator
        </span>
      </div>

      <div
        className={`group ${status === 'running' ? 'agent-running' : ''}`}
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderLeft: `3px solid ${color}`,
          padding: '14px 16px',
          ...(status === 'running' ? { '--agent-color': `${color}40` } as React.CSSProperties : {}),
        }}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${color}14`,
              flexShrink: 0,
            }}
          >
            <Brain style={{ width: 15, height: 15, color }} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {orchestrator.name}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)', color, background: `${color}18`,
                border: `1px solid ${color}30`, padding: '2px 6px', flexShrink: 0,
              }}>
                Orchestrator
              </span>
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <Sparkles style={{ width: 11, height: 11, color: 'var(--color-text-disabled)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                  {modelLabel}
                </span>
              </div>
            </div>

            {orchestrator.description && (
              <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 4 }}>
                {orchestrator.description}
              </p>
            )}

            {status !== 'idle' && (
              <div className="flex items-center gap-1.5 mt-2">
                {status === 'running' && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }} />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>running...</span>
                  </>
                )}
                {status === 'completed' && (
                  <div className="flex items-center gap-1 animate-fade-in">
                    <Check style={{ width: 11, height: 11, color: '#8ec07c' }} />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#8ec07c' }}>completed</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Edit button */}
          <button
            onClick={onConfigure}
            className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1"
            style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-disabled)',
              border: '1px solid var(--color-border-subtle)',
              padding: '3px 8px',
              background: 'transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fabd2f'; e.currentTarget.style.borderColor = 'rgba(250,189,47,0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
          >
            <Pencil style={{ width: 10, height: 10 }} />
            <span>edit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
