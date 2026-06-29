import { useNavigate } from '@tanstack/react-router';
import { Clock, Bot, ArrowRight } from 'lucide-react';
import type { Project } from '@subagent/shared';
import { formatRelativeTime } from '../../lib/format';

interface ProjectCardProps {
  project: Project;
  agentCount?: number;
  index?: number;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active:   { color: 'var(--color-success)', label: 'Active' },
  archived: { color: 'var(--color-text-tertiary)', label: 'Archived' },
  draft:    { color: 'var(--color-accent)', label: 'Draft' },
};

function ProjectInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: 42,
        height: 42,
        borderRadius: 'var(--radius-md)',
        background: 'linear-gradient(135deg, rgba(124,140,248,0.28), rgba(124,140,248,0.06))',
        border: '1px solid rgba(124,140,248,0.3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--color-accent-hover)',
        letterSpacing: '0.02em',
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
      type="button"
      onClick={() => navigate({ to: '/projects/$projectId', params: { projectId: project.id } })}
      aria-label={`Open project ${project.name}, status ${status.label}`}
      className="group relative flex flex-col text-left w-full overflow-hidden transition-all duration-200 animate-fade-in-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
      style={{
        animationDelay: `${index * 40}ms`,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '18px 20px',
        minHeight: 158,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--glass-border-hover)';
        el.style.background = 'var(--color-bg-raised)';
        el.style.boxShadow = '0 8px 28px rgba(0,0,0,0.45)';
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--color-border-subtle)';
        el.style.background = 'var(--color-bg-surface)';
        el.style.boxShadow = 'none';
        el.style.transform = 'translateY(0)';
      }}
      onFocus={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--glass-border-hover)';
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--color-border-subtle)';
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-3 min-w-0">
          <ProjectInitials name={project.name} />
          <div className="min-w-0">
            <h3 className="truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', lineHeight: 1.25 }}>
              {project.name}
            </h3>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
              project
            </span>
          </div>
        </div>

        {/* Status pill (dot + label) */}
        <span
          className="flex items-center gap-1.5 shrink-0"
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
            color: status.color, background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-xl)', padding: '3px 9px',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }} />
          {status.label}
        </span>
      </div>

      {/* Description */}
      <p
        className="flex-1 line-clamp-2"
        style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}
      >
        {project.description || 'No description'}
      </p>

      {/* Footer */}
      <div className="flex items-center gap-4" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)' }}>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
          <Bot style={{ width: 12, height: 12 }} aria-hidden="true" />
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
        <span
          className="flex items-center gap-1.5"
          style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}
          title={`Updated ${new Date(project.updatedAt).toLocaleString()}`}
        >
          <Clock style={{ width: 12, height: 12 }} aria-hidden="true" />
          {formatRelativeTime(project.updatedAt)}
        </span>
        <span
          className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150"
          style={{ fontSize: 11, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
          aria-hidden="true"
        >
          open <ArrowRight style={{ width: 12, height: 12 }} />
        </span>
      </div>
    </button>
  );
}
