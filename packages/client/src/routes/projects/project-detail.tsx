import { Outlet, useParams } from '@tanstack/react-router';
import { useProject } from '../../api/hooks/use-projects';
import { ProjectNav } from '../../components/layout/project-nav';
import { Skeleton } from '../../components/ui/skeleton';

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: project, isLoading } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="h-full flex">
        <div
          className="w-[260px] shrink-0 p-4 flex flex-col gap-3"
          style={{
            background: 'var(--color-bg-nav)',
            borderRight: '1px solid var(--color-border-subtle)',
          }}
        >
          <Skeleton height={14} width={80} />
          <div className="flex items-center gap-3">
            <Skeleton height={36} width={36} />
            <div className="flex-1">
              <Skeleton height={16} width="70%" />
              <Skeleton height={12} width="40%" className="mt-1.5" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
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

  return (
    <div className="h-full flex">
      <ProjectNav project={project} />
      <div className="flex-1 overflow-y-auto px-10 py-8" style={{ background: 'var(--color-bg-base)' }}>
        <Outlet />
      </div>
    </div>
  );
}
