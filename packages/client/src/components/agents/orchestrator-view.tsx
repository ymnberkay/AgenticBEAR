import { Brain, Sparkles } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { CLAUDE_MODELS, AGENT_COLORS } from '@subagent/shared';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/cn';
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
        className="w-full border border-dashed border-border-default p-5 text-center hover:border-border-default hover:bg-bg-raised transition-colors duration-150"
      >
        <Brain className="h-7 w-7 text-text-disabled mx-auto mb-1.5" />
        <p className="text-[12px] font-medium text-text-secondary mb-0.5">
          No Orchestrator Configured
        </p>
        <p className="text-[11px] text-text-tertiary">
          Add an orchestrator agent to coordinate your specialist agents.
        </p>
      </button>
    );
  }

  const modelLabel = CLAUDE_MODELS[orchestrator.modelConfig.model]?.label ?? orchestrator.modelConfig.model;

  return (
    <div
      className="border p-3 cursor-pointer transition-colors duration-150 hover:bg-bg-raised"
      style={{
        borderColor: `${color}20`,
        backgroundColor: `${color}06`,
      }}
      onClick={() => {
        selectAgent(orchestrator.id);
        onConfigure();
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center"
          style={{
            backgroundColor: `${color}15`,
            color,
          }}
        >
          <Brain className="h-4.5 w-4.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[13px] font-semibold text-text-primary tracking-tight">
              {orchestrator.name}
            </h3>
            <Badge color={color}>Orchestrator</Badge>
            <div className="flex items-center gap-1 ml-auto">
              <Sparkles className="h-3 w-3 text-text-disabled" />
              <span className="text-[10px] text-text-disabled">{modelLabel}</span>
            </div>
          </div>

          {orchestrator.description && (
            <p className="text-[11px] text-text-secondary mb-1.5">
              {orchestrator.description}
            </p>
          )}

          <div className="bg-bg-raised border border-border-default p-1.5">
            <p className="text-[10px] font-mono text-text-secondary line-clamp-3 leading-relaxed">
              {orchestrator.systemPrompt}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
