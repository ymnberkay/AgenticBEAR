import { Brain, Sparkles, Pencil, Check } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { CLAUDE_MODELS, AGENT_COLORS } from '@subagent/shared';
import { Badge } from '../ui/badge';
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
      <button
        onClick={onConfigure}
        className="w-full text-left transition-all duration-200 group"
        style={{
          border: '1px dashed var(--color-border-default)',
          padding: '24px',
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-accent)';
          e.currentTarget.style.background = 'var(--color-accent-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-default)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 flex items-center justify-center shrink-0"
            style={{ background: 'rgba(212, 146, 78, 0.1)', border: '1px solid rgba(212, 146, 78, 0.2)' }}
          >
            <Brain className="h-5 w-5 text-text-disabled group-hover:text-accent transition-colors duration-200" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text-secondary group-hover:text-text-primary transition-colors duration-200">
              No Orchestrator Configured
            </p>
            <p className="text-[11px] text-text-disabled mt-0.5">
              Click to add an orchestrator agent
            </p>
          </div>
        </div>
      </button>
    );
  }

  const modelLabel = CLAUDE_MODELS[orchestrator.modelConfig.model]?.label ?? orchestrator.modelConfig.model;

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-text-disabled mb-3">
        Orchestrator
      </div>
      <div
        className={`w-full text-left transition-all duration-200 group ${status === 'running' ? 'agent-running' : ''}`}
        style={{
          background: `${color}08`,
          border: `1px solid ${color}22`,
          padding: '16px',
          ...(status === 'running' ? { '--agent-color': `${color}40` } as React.CSSProperties : {}),
        }}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center"
            style={{ backgroundColor: `${color}18`, color }}
          >
            <Brain className="h-5 w-5" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[14px] font-semibold text-text-primary tracking-tight">
                {orchestrator.name}
              </span>
              <Badge color={color}>Orchestrator</Badge>
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <Sparkles className="h-3 w-3 text-text-disabled" />
                <span className="text-[10px] text-text-disabled font-mono">{modelLabel}</span>
              </div>
            </div>

            {orchestrator.description && (
              <p className="text-[12px] text-text-secondary leading-relaxed">
                {orchestrator.description}
              </p>
            )}

            {/* Status indicator */}
            {status !== 'idle' && (
              <div className="flex items-center gap-1.5 mt-2">
                {status === 'running' && (
                  <>
                    <span
                      className="h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] text-text-tertiary">Running...</span>
                  </>
                )}
                {status === 'completed' && (
                  <div className="flex items-center gap-1 animate-fade-in">
                    <Check className="h-3 w-3 text-[#6bbfa0]" />
                    <span className="text-[10px] text-[#6bbfa0]">Completed</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Edit button */}
          <button
            onClick={onConfigure}
            className="shrink-0 flex items-center gap-1 text-[10px] text-text-disabled hover:text-text-secondary transition-colors duration-200 opacity-0 group-hover:opacity-100 mt-1"
          >
            <Pencil className="h-3 w-3" />
            <span>Edit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
