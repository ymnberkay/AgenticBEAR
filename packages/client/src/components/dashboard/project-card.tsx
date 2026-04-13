import { useNavigate } from '@tanstack/react-router';
import { Clock, Bot } from 'lucide-react';
import type { Project } from '@subagent/shared';
import { formatRelativeTime } from '../../lib/format';

interface ProjectCardProps {
  project: Project;
  agentCount?: number;
  index?: number;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active:   { color: '#6db58a', label: 'active' },
  archived: { color: '#9ca8a2', label: 'archived' },
  draft:    { color: '#6EACDA', label: 'draft' },
};

function ProjectInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      style={{
        width: 36,
        height: 36,
        background: 'rgba(110, 172, 218, 0.1)',
        border: '1px solid rgba(110, 172, 218, 0.22)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        fontWeight: 600,
        color: '#6EACDA',
        flexShrink: 0,
        letterSpacing: '0.04em',
      }}
    >
      {initials || '?'}
    </div>
  );
}

export function ProjectCard({ project, agentCount = 0, index = 0 }: ProjectCardProps) {
  const navigate = useNavigate();
  const status = statusConfig[project.status] ?? statusConfig.draft;

  return (
    <button
      onClick={() =>
        navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
      }
      className="group relative flex flex-col text-left w-full overflow-hidden transition-all duration-200 animate-fade-in-up"
      style={{
        animationDelay: `${index * 50}ms`,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: '3px solid #03346E',
        padding: '16px 18px',
        minHeight: 130,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderLeftColor = '#6EACDA';
        el.style.borderColor = 'var(--color-border-default)';
        el.style.borderLeftColor = '#6EACDA';
        el.style.background = 'var(--color-bg-raised)';
        el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--color-border-subtle)';
        el.style.borderLeftColor = '#03346E';
        el.style.background = 'var(--color-bg-surface)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <ProjectInitials name={project.name} />
          <h3
            className="text-[14px] font-semibold truncate transition-colors duration-150"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            {project.name}
          </h3>
        </div>

        {/* Status badge */}
        <span
          className="shrink-0 text-[10px] font-medium tracking-wide uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            color: status.color,
            background: `${status.color}18`,
            border: `1px solid ${status.color}35`,
            padding: '2px 7px',
          }}
        >
          {status.label}
        </span>
      </div>

      {/* Description */}
      <p
        className="text-[12px] leading-relaxed flex-1 line-clamp-2"
        style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}
      >
        {project.description || '—'}
      </p>

      {/* Footer */}
      <div
        className="flex items-center gap-4 mt-4 pt-3"
        style={{ borderTop: '1px solid var(--color-border-subtle)' }}
      >
        <span
          className="flex items-center gap-1.5 text-[11px]"
          style={{ color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}
        >
          <Bot className="h-3 w-3" />
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
        <span
          className="flex items-center gap-1.5 text-[11px]"
          style={{ color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}
        >
          <Clock className="h-3 w-3" />
          {formatRelativeTime(project.updatedAt)}
        </span>
        <span
          className="ml-auto text-[11px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ color: '#6EACDA', fontFamily: 'var(--font-mono)' }}
        >
          open →
        </span>
      </div>
    </button>
  );
}
