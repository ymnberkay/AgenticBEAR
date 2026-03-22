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
        className="w-full rounded-md border border-dashed border-[#333333] p-5 text-center hover:border-[#333333] hover:bg-[#252526] transition-colors duration-150"
      >
        <Brain className="h-7 w-7 text-[#5a5a5a] mx-auto mb-1.5" />
        <p className="text-[12px] font-medium text-[#858585] mb-0.5">
          No Orchestrator Configured
        </p>
        <p className="text-[11px] text-[#5a5a5a]">
          Add an orchestrator agent to coordinate your specialist agents.
        </p>
      </button>
    );
  }

  const modelLabel = CLAUDE_MODELS[orchestrator.modelConfig.model]?.label ?? orchestrator.modelConfig.model;

  return (
    <div
      className="rounded-md border p-3 cursor-pointer transition-colors duration-150 hover:bg-[#252526]"
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: `${color}15`,
            color,
          }}
        >
          <Brain className="h-4.5 w-4.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[13px] font-semibold text-[#cccccc] tracking-tight">
              {orchestrator.name}
            </h3>
            <Badge color={color}>Orchestrator</Badge>
            <div className="flex items-center gap-1 ml-auto">
              <Sparkles className="h-3 w-3 text-[#5a5a5a]" />
              <span className="text-[10px] text-[#5a5a5a]">{modelLabel}</span>
            </div>
          </div>

          {orchestrator.description && (
            <p className="text-[11px] text-[#858585] mb-1.5">
              {orchestrator.description}
            </p>
          )}

          <div className="rounded-md bg-[#252526] border border-[#333333] p-1.5">
            <p className="text-[10px] font-mono text-[#858585] line-clamp-3 leading-relaxed">
              {orchestrator.systemPrompt}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
