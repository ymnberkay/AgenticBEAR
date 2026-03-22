import { Plus, Bot } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { AgentCard } from './agent-card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

interface AgentListProps {
  agents: Agent[] | undefined;
  isLoading: boolean;
  onAddAgent: () => void;
  onSelectAgent: (agent: Agent) => void;
}

export function AgentList({ agents, isLoading, onAddAgent, onSelectAgent }: AgentListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={88} />
        ))}
      </div>
    );
  }

  const specialists = agents?.filter((a) => a.role === 'specialist') ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase text-[#5a5a6e] tracking-wider">
          Specialist Agents
          {specialists.length > 0 && (
            <span className="text-[#3a3a4a] ml-1.5">({specialists.length})</span>
          )}
        </h3>
        <Button size="sm" variant="outline" icon={<Plus className="h-3 w-3" />} onClick={onAddAgent}>
          Add Agent
        </Button>
      </div>

      {specialists.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-14 px-6 rounded-xl"
          style={{
            border: '1px dashed rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <Bot className="h-8 w-8 text-[#3a3a4a] mb-3" />
          <p className="text-[13px] text-[#5a5a6e] mb-3">
            No specialist agents yet
          </p>
          <Button size="sm" variant="outline" onClick={onAddAgent}>
            Add Specialist
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {specialists.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => onSelectAgent(agent)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
