import { Outlet, useParams, Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { useProject } from '../../api/hooks/use-projects';
import { ProjectNav } from '../../components/layout/project-nav';
import { Skeleton } from '../../components/ui/skeleton';

const statusConfig: Record<string, { color: string; glow: string; label: string }> = {
  active: { color: '#6bbfa0', glow: 'rgba(107, 191, 160, 0.4)', label: 'Active' },
  archived: { color: '#d4924e', glow: 'rgba(212, 146, 78, 0.4)', label: 'Archived' },
  draft: { color: '#6a5a48', glow: 'rgba(106, 90, 72, 0.3)', label: 'Draft' },
};

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: project, isLoading } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div
          className="shrink-0 px-6 py-3"
          style={{
            background: 'var(--color-bg-nav)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <Skeleton height={16} width={200} />
        </div>
        <div className="flex-1 p-8" style={{ background: 'var(--color-bg-base)' }}>
          <Skeleton height={300} />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ background: 'var(--color-bg-base)' }}>
        <p className="text-[14px] text-text-tertiary">Project not found</p>
      </div>
    );
  }

  const status = statusConfig[project.status] ?? statusConfig.draft;

  return (
    <div className="h-full flex flex-col">
      {/* Full-width project header bar */}
      <div
        className="shrink-0"
        style={{
          background: 'var(--color-bg-nav)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div className="flex items-center gap-2 px-8 h-12">
          <div className="flex items-center gap-2 text-[13px] min-w-0">
            <Link
              to="/"
              className="text-text-tertiary font-medium shrink-0 hover:text-text-secondary transition-colors duration-200 cursor-pointer"
            >
              AgenticBEAR
            </Link>
            <span className="text-text-disabled">/</span>
            <span className="text-text-primary font-semibold truncate">{project.name}</span>
          </div>

          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: status.color, boxShadow: `0 0 6px ${status.glow}` }}
            />
            <span className="text-[10px] text-text-tertiary capitalize tracking-wide font-medium">
              {status.label}
            </span>
          </div>

          <div className="flex-1" />

          <Link
            to="/projects/$projectId/settings"
            params={{ projectId: project.id }}
            className="flex items-center justify-center h-8 w-8 shrink-0 mr-2 text-text-disabled hover:text-text-secondary transition-colors duration-200"
            title="Project Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Content area with sidebar */}
      <div className="flex-1 flex min-h-0">
        <ProjectNav project={project} />
        <div className="flex-1 overflow-y-auto px-16 py-10" style={{ background: 'var(--color-bg-base)' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
