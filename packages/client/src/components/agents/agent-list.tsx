import { Plus, Bot } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { AgentCard } from './agent-card';
import type { AgentStatus } from './agent-card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

interface AgentListProps {
  agents: Agent[] | undefined;
  isLoading: boolean;
  agentStatuses?: Record<string, AgentStatus>;
  selectedAgentId?: string;
  onAddAgent: () => void;
  onViewAgent: (agent: Agent) => void;
  onEditAgent: (agent: Agent) => void;
}

export function AgentList({
  agents,
  isLoading,
  agentStatuses = {},
  selectedAgentId,
  onAddAgent,
  onViewAgent,
  onEditAgent,
}: AgentListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={64} />
        ))}
      </div>
    );
  }

  const specialists = agents?.filter((a) => a.role === 'specialist') ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-disabled">
            Specialist Agents
          </span>
          {specialists.length > 0 && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5"
              style={{
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {specialists.length}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" icon={<Plus className="h-3 w-3" />} onClick={onAddAgent}>
          Add Agent
        </Button>
      </div>

      {specialists.length === 0 ? (
        <button
          onClick={onAddAgent}
          className="flex flex-col items-center justify-center py-16 px-6 w-full transition-all duration-200 group"
          style={{
            border: '1px dashed var(--color-border-default)',
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
          <div
            className="h-10 w-10 flex items-center justify-center mb-3"
            style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)' }}
          >
            <Bot className="h-5 w-5 text-text-disabled group-hover:text-text-tertiary transition-colors duration-200" />
          </div>
          <p className="text-[13px] font-medium text-text-secondary group-hover:text-text-primary transition-colors duration-200">
            No specialist agents yet
          </p>
          <p className="text-[11px] text-text-disabled mt-1">
            Click to add your first agent
          </p>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {specialists.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              status={agentStatuses[agent.id] ?? 'idle'}
              selected={selectedAgentId === agent.id}
              onClick={() => onViewAgent(agent)}
              onEdit={() => onEditAgent(agent)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
