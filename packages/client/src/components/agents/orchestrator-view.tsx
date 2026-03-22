import { Brain, Sparkles, ChevronRight } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { CLAUDE_MODELS, AGENT_COLORS } from '@subagent/shared';
import { Badge } from '../ui/badge';
import { useSelectionStore } from '../../stores/selection.store';

interface OrchestratorViewProps {
  orchestrator: Agent | undefined;
  onConfigure: () => void;
}

export function OrchestratorView({ orchestrator, onConfigure }: OrchestratorViewProps) {
  const selectAgent = useSelectionStore((s) => s.selectAgent);
  const color = AGENT_COLORS.orchestrator;

  if (!orchestrator) {
    return (
      <button
        onClick={onConfigure}
        className="w-full text-left transition-all duration-200 group"
        style={{
          border: '1px dashed var(--color-border-default)',
          padding: '20px',
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
          <ChevronRight className="h-4 w-4 text-text-disabled group-hover:text-text-tertiary transition-colors duration-200 ml-auto shrink-0" />
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
      <button
        className="w-full text-left transition-all duration-200 group"
        style={{
          background: `${color}08`,
          border: `1px solid ${color}22`,
          padding: '16px',
        }}
        onClick={() => {
          selectAgent(orchestrator.id);
          onConfigure();
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `${color}12`;
          e.currentTarget.style.borderColor = `${color}38`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = `${color}08`;
          e.currentTarget.style.borderColor = `${color}22`;
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
            <div className="flex items-center gap-2 mb-1.5">
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
              <p className="text-[12px] text-text-secondary mb-2 leading-relaxed">
                {orchestrator.description}
              </p>
            )}

            <div
              className="px-2.5 py-2"
              style={{
                background: 'var(--color-bg-inset)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <p className="text-[10px] font-mono text-text-tertiary line-clamp-2 leading-relaxed">
                {orchestrator.systemPrompt}
              </p>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-text-disabled group-hover:text-text-tertiary transition-colors duration-200 shrink-0 mt-1" />
        </div>
      </button>
    </div>
  );
}
