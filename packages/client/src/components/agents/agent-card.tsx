import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot, Pencil, Check,
} from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/cn';

export type AgentStatus = 'idle' | 'running' | 'completed';

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
};

interface AgentCardProps {
  agent: Agent;
  status?: AgentStatus;
  selected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
}

export function AgentCard({ agent, status = 'idle', selected = false, onClick, onEdit }: AgentCardProps) {
  const Icon = iconMap[agent.icon] || Bot;
  const modelLabel = CLAUDE_MODELS[agent.modelConfig.model]?.label ?? agent.modelConfig.model;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left group transition-all duration-200 cursor-pointer',
        status === 'running' && 'agent-running',
      )}
      style={{
        background: selected ? `${agent.color}10` : 'var(--color-bg-card)',
        border: selected ? `1px solid ${agent.color}35` : '1px solid var(--color-border-subtle)',
        padding: '14px 16px',
        ...(status === 'running' ? { '--agent-color': `${agent.color}40` } as React.CSSProperties : {}),
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--color-border-default)';
          e.currentTarget.style.background = 'var(--color-bg-card-hover, rgba(255,255,255,0.03))';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
          e.currentTarget.style.background = 'var(--color-bg-card)';
        }
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Icon */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center"
          style={{ backgroundColor: `${agent.color}15`, color: agent.color }}
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-text-primary truncate">{agent.name}</span>
            <span
              className="shrink-0 text-[10px] font-medium truncate"
              style={{
                color: agent.color,
                background: `${agent.color}15`,
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              {modelLabel}
            </span>
            {status === 'running' && (
              <span className="flex items-center gap-1 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: agent.color }} />
              </span>
            )}
            {status === 'completed' && (
              <Check className="h-3 w-3 text-[#8ec07c] shrink-0 animate-fade-in" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge color={agent.color}>{agent.role}</Badge>
          </div>
        </div>

        {/* Edit button - shows on hover */}
        {onEdit && (
          <button
            onClick={handleEdit}
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] text-text-disabled hover:text-text-secondary transition-all duration-200 opacity-0 group-hover:opacity-100"
            style={{ border: '1px solid transparent' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
              e.currentTarget.style.background = 'var(--color-bg-raised)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Pencil className="h-2.5 w-2.5" />
            Edit
          </button>
        )}
      </div>
    </button>
  );
}
