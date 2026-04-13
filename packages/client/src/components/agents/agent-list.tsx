import { Plus, Bot } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { AgentCard } from './agent-card';
import type { AgentStatus } from './agent-card';
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
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            Specialist Agents
          </span>
          {specialists.length > 0 && (
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              background: 'var(--color-bg-raised)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-disabled)',
              padding: '1px 6px',
            }}>
              {specialists.length}
            </span>
          )}
        </div>
        <button
          onClick={onAddAgent}
          className="flex items-center gap-1.5"
          style={{
            height: 28,
            padding: '0 12px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--color-border-default)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.4)'; e.currentTarget.style.color = '#6EACDA'; e.currentTarget.style.background = 'rgba(110,172,218,0.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <Plus style={{ width: 11, height: 11 }} />
          Add Agent
        </button>
      </div>

      {specialists.length === 0 ? (
        <button
          onClick={onAddAgent}
          className="flex flex-col items-center justify-center group"
          style={{
            padding: '40px 24px',
            width: '100%',
            border: '1px dashed var(--color-border-default)',
            background: 'transparent',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(110,172,218,0.35)';
            e.currentTarget.style.background = 'rgba(110,172,218,0.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Bot style={{ width: 18, height: 18, color: 'var(--color-text-disabled)', marginBottom: 10 }} />
          <p style={{ fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            No specialist agents yet
          </p>
          <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 4 }}>
            click to add your first agent
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
