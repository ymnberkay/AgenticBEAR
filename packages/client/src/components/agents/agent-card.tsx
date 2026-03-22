import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
} from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/cn';
import { useSelectionStore } from '../../stores/selection.store';

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
};

interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const selectedAgentId = useSelectionStore((s) => s.selectedAgentId);
  const selectAgent = useSelectionStore((s) => s.selectAgent);
  const Icon = iconMap[agent.icon] || Bot;
  const modelLabel = CLAUDE_MODELS[agent.modelConfig.model]?.label ?? agent.modelConfig.model;
  const isSelected = selectedAgentId === agent.id;

  const handleClick = () => {
    selectAgent(agent.id);
    onClick?.();
  };

  return (
    <Card
      hoverable
      onClick={handleClick}
      className={cn(
        'group transition-all duration-200 overflow-hidden',
        isSelected && 'border-accent/40 bg-accent-subtle',
      )}
    >
      <div className="flex flex-col gap-3 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200"
            style={{
              backgroundColor: `${agent.color}15`,
              color: agent.color,
            }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-[13px] font-semibold text-[#e2e2e8] truncate">
              {agent.name}
            </div>
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              <Badge color={agent.color}>{agent.role}</Badge>
              <span className="text-[10px] text-[#5a5a6e] truncate">{modelLabel}</span>
            </div>
          </div>
        </div>

        {/* Prompt preview */}
        {agent.systemPrompt && (
          <p className="text-[11px] text-[#5a5a6e] line-clamp-2 font-mono leading-relaxed break-words">
            {agent.systemPrompt}
          </p>
        )}
      </div>
    </Card>
  );
}
