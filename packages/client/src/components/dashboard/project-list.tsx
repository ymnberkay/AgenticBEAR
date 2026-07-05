import { useMemo, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import type { Project } from '@subagent/shared';
import { ProjectCard } from './project-card';
import { Skeleton } from '../ui/skeleton';

type SortKey = 'updated' | 'created' | 'name';
type StatusFilter = 'all' | 'active' | 'draft' | 'archived';

interface ProjectListProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  onCreateProject: () => void;
}

export function ProjectList({ projects, isLoading, onCreateProject }: ProjectListProps) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('updated');

  const filtered = useMemo(() => {
    let list = projects ?? [];
    if (status !== 'all') list = list.filter((p) => p.status === status);
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'created') sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sorted;
  }, [projects, status, sort]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" role="status" aria-live="polite" aria-label="Loading projects">
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
              borderRadius: 'var(--radius-md)',
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
    const steps = [
      { num: '01', color: 'var(--color-agent-orchestrator)', title: 'Create a project', desc: 'Name it and point it at a workspace — a git repo or a blank slate.' },
      { num: '02', color: 'var(--color-agent-backend)', title: 'Assemble your agents', desc: 'Add specialists — backend, frontend, QA, DevOps — or start from a template.' },
      { num: '03', color: 'var(--color-agent-database)', title: 'Run the orchestration', desc: 'Give them a goal and watch the run unfold in real time.' },
    ];
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh] animate-fade-in">
        <div
          className="w-full"
          style={{
            maxWidth: 500,
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
          }}
        >
          {/* Terminal-style header strip */}
          <div
            aria-hidden="true"
            className="flex items-center gap-2"
            style={{
              padding: '10px 18px',
              borderBottom: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              color: 'var(--color-text-tertiary)',
            }}
          >
            <span style={{ color: 'var(--color-accent)' }}>$</span>
            <span>agenticbear init</span>
            <span className="animate-cursor-blink" style={{ width: 7, height: 13, background: 'var(--color-text-tertiary)' }} />
          </div>

          <div style={{ padding: '26px 30px 28px' }}>
            <h3
              className="text-[17px] font-semibold"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 6 }}
            >
              No projects yet
            </h3>
            <p
              className="text-[12.5px] leading-relaxed"
              style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginBottom: 22 }}
            >
              Build your agent army — three steps to your first orchestration.
            </p>

            <ol className="flex flex-col gap-3.5" style={{ listStyle: 'none', margin: '0 0 26px', padding: 0 }}>
              {steps.map((s) => (
                <li key={s.num} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex-shrink-0"
                    style={{ width: 8, height: 8, marginTop: 5, borderRadius: 2, background: s.color }}
                  />
                  <span
                    className="flex-shrink-0"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)', paddingTop: 1 }}
                  >
                    {s.num}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                      {s.title}
                    </span>
                    <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                      {s.desc}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={onCreateProject}
                className="flex items-center gap-2 text-[13px] font-semibold px-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] bg-[#7c8cf8] hover:bg-[#97a4ff]"
                style={{
                  height: 40,
                  color: '#021526',
                  fontFamily: 'var(--font-sans)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}
              >
                <FolderPlus className="h-4 w-4" aria-hidden="true" />
                Create Project
              </button>
              <span className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                <kbd
                  style={{
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-default)',
                    background: 'var(--color-bg-raised)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  ⌘K
                </kbd>
                to search
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar — status filter + sort. Global ⌘K search handles project lookup. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1" role="group" aria-label="Status filter">
          {([
            { id: 'all' as const, label: `All (${projects.length})` },
            { id: 'active' as const, label: 'Active' },
            { id: 'draft' as const, label: 'Draft' },
            { id: 'archived' as const, label: 'Archived' },
          ]).map((opt) => {
            const isActive = status === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatus(opt.id)}
                aria-pressed={isActive}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  height: 32, padding: '0 10px', fontSize: 11.5,
                  fontFamily: 'var(--font-mono)',
                  background: isActive ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                  border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort projects"
            style={{
              height: 32, padding: '0 8px', background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 11.5, borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="name">Name (A→Z)</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          No projects match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((project, index) => (
            <ProjectCard key={project.id} project={project} agentCount={project.agentCount ?? 0} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
