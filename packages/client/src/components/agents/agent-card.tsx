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

  const handleEdit = (e: React.MouseEvent) => { e.stopPropagation(); onEdit?.(); };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${agent.name}, ${agent.role}${status === 'running' ? ', running' : status === 'completed' ? ', completed' : ''}`}
      aria-pressed={selected}
      className={cn(
        'group relative flex flex-col text-left w-full transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]',
        status === 'running' && 'agent-running',
      )}
      style={{
        gap: 11,
        background: selected ? `${agent.color}12` : 'var(--color-bg-card)',
        border: `1px solid ${selected ? agent.color + '45' : 'var(--color-border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 14px 13px',
        minHeight: 112,
        ...(status === 'running' ? { '--agent-color': `${agent.color}40` } as React.CSSProperties : {}),
      }}
      onMouseEnter={(e) => {
        if (selected) return;
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
        e.currentTarget.style.background = 'var(--color-bg-raised)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.background = 'var(--color-bg-card)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Top: icon + status / edit */}
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ height: 38, width: 38, borderRadius: 'var(--radius-md)', backgroundColor: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}2a` }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {status === 'running' && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: agent.color }} />}
          {status === 'completed' && <Check className="h-3.5 w-3.5 animate-fade-in" style={{ color: 'var(--color-success)' }} />}
          {onEdit && (
            <button
              type="button"
              onClick={handleEdit}
              aria-label={`Edit agent ${agent.name}`}
              title="Edit"
              className="flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ height: 28, width: 28, borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', border: '1px solid transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.background = 'var(--color-bg-raised)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Name + meta */}
      <div className="min-w-0">
        <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.25 }}>
          {agent.name}
        </div>
        <div className="flex items-center gap-2 min-w-0" style={{ marginTop: 6 }}>
          <Badge color={agent.color}>{agent.role}</Badge>
          <span className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            {modelLabel}
          </span>
        </div>
      </div>
    </button>
  );
}
