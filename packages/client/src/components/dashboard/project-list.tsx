import { FolderPlus } from 'lucide-react';
import type { Project } from '@subagent/shared';
import { ProjectCard } from './project-card';
import { Skeleton } from '../ui/skeleton';

interface ProjectListProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  onCreateProject: () => void;
}

export function ProjectList({ projects, isLoading, onCreateProject }: ProjectListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderLeft: '3px solid #03346E',
              padding: '16px 18px',
              minHeight: 130,
              animationDelay: `${i * 50}ms`,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Skeleton height={36} width={36} />
                <Skeleton height={14} width={100} />
              </div>
              <Skeleton height={18} width={52} />
            </div>
            <Skeleton height={12} width="85%" />
            <Skeleton height={12} width="60%" className="mt-1.5" />
            <div className="flex items-center gap-4 mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <Skeleton height={11} width={60} />
              <Skeleton height={11} width={55} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
        <div
          className="flex h-16 w-16 items-center justify-center mb-5"
          style={{
            background: 'rgba(110, 172, 218, 0.08)',
            border: '1px solid rgba(110, 172, 218, 0.2)',
          }}
        >
          <FolderPlus className="h-7 w-7" style={{ color: '#6EACDA' }} />
        </div>
        <h3
          className="text-[16px] font-semibold mb-2"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          No projects yet
        </h3>
        <p
          className="text-[12px] mb-6 text-center max-w-[300px] leading-relaxed"
          style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}
        >
          Create your first project to start orchestrating AI agents.
        </p>
        <button
          onClick={onCreateProject}
          className="text-[13px] font-semibold px-5 transition-all duration-150 hover:opacity-80"
          style={{
            height: 38,
            background: '#6EACDA',
            color: '#021526',
            fontFamily: 'var(--font-sans)',
            border: 'none',
          }}
        >
          Create Project
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {projects.map((project, index) => (
        <ProjectCard key={project.id} project={project} index={index} />
      ))}
    </div>
  );
}
