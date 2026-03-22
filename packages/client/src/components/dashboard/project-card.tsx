import { useNavigate } from '@tanstack/react-router';
import { Clock, Users, ChevronRight, Bot, Hexagon } from 'lucide-react';
import type { Project } from '@subagent/shared';
import { formatRelativeTime } from '../../lib/format';

interface ProjectCardProps {
  project: Project;
  agentCount?: number;
  index?: number;
}

const statusConfig: Record<string, { color: string; glow: string; label: string }> = {
  active: { color: '#10b981', glow: 'rgba(16, 185, 129, 0.4)', label: 'Active' },
  archived: { color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', label: 'Archived' },
  draft: { color: '#9fb5ca', glow: 'rgba(159, 181, 202, 0.3)', label: 'Draft' },
};

export function ProjectCard({ project, agentCount = 0, index = 0 }: ProjectCardProps) {
  const navigate = useNavigate();
  const status = statusConfig[project.status] ?? statusConfig.draft;

  return (
    <button
      onClick={() =>
        navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
      }
      className="group relative flex flex-col text-left p-6 min-h-[180px] overflow-hidden transition-all duration-300 ease-out animate-fade-in-up"
      style={{
        animationDelay: `${index * 60}ms`,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--color-bg-card-hover)';
        el.style.borderColor = 'var(--glass-border-hover)';
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.3), 0 0 34px rgba(0, 212, 255, 0.12)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--color-bg-card)';
        el.style.borderColor = 'var(--color-border-default)';
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Gradient accent line at top */}
      <div
        className="absolute top-0 left-6 right-6 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), #00e6a8, transparent)' }}
      />

      {/* Top: icon + status */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div
          className="h-10 w-10 flex items-center justify-center shrink-0 transition-all duration-300"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.17), rgba(0, 230, 168, 0.15))',
            border: '1px solid rgba(0, 212, 255, 0.25)',
          }}
        >
          <Hexagon className="h-5 w-5 text-[#64ecff]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{
              backgroundColor: status.color,
              boxShadow: `0 0 6px ${status.glow}`,
            }}
          />
          <span className="text-[11px] font-medium" style={{ color: status.color }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Name */}
      <h3 className="text-[15px] font-semibold text-text-primary group-hover:text-white truncate transition-colors duration-200 mb-1.5 max-w-full">
        {project.name}
      </h3>

      {/* Description */}
      <p className="text-[12.5px] text-text-tertiary line-clamp-2 flex-1 leading-relaxed break-words">
        {project.description || 'No description'}
      </p>

      {/* Bottom: meta */}
      <div className="flex items-center justify-between mt-4 pt-3.5 gap-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-3 text-[11.5px] text-text-tertiary min-w-0 overflow-hidden">
          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Bot className="h-3.5 w-3.5 shrink-0" />
            {agentCount} agents
          </span>
          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {formatRelativeTime(project.updatedAt)}
          </span>
        </div>
        <div className="h-6 w-6 flex items-center justify-center bg-transparent group-hover:bg-[rgba(0,212,255,0.12)] transition-all duration-200">
          <ChevronRight className="h-3.5 w-3.5 text-text-tertiary group-hover:text-[#00d4ff] transition-colors duration-200" />
        </div>
      </div>
    </button>
  );
}
