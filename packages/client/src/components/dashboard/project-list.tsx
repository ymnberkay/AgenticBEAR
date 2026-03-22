import { FolderPlus, Sparkles } from 'lucide-react';
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-6 min-h-[180px]"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              animationDelay: `${i * 60}ms`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <Skeleton height={40} width={40} />
              <Skeleton height={16} width={48} />
            </div>
            <Skeleton height={16} width="70%" />
            <Skeleton height={13} width="90%" className="mt-2" />
            <Skeleton height={13} width="50%" className="mt-1.5" />
            <div className="flex items-center gap-4 mt-4 pt-3.5" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <Skeleton height={12} width={65} />
              <Skeleton height={12} width={65} />
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
          className="relative flex h-20 w-20 items-center justify-center rounded-xl mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}
        >
          <FolderPlus className="h-8 w-8 text-[#6366f1]" />
          <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-[#a78bfa] animate-float" />
        </div>
        <h3 className="text-[18px] font-semibold text-[#e2e2e8] mb-2">
          No projects yet
        </h3>
        <p className="text-[13px] text-[#5a5a6e] mb-7 text-center max-w-[320px] leading-relaxed">
          Create your first project to start orchestrating AI agents and managing complex workflows.
        </p>
        <button
          onClick={onCreateProject}
          className="h-[42px] rounded-lg text-white text-[14px] font-medium px-6 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
          }}
        >
          Create Your First Project
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {projects.map((project, index) => (
        <ProjectCard key={project.id} project={project} index={index} />
      ))}
    </div>
  );
}
