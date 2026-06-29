import { useMemo, useState } from 'react';
import { FolderPlus, Search, X } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('updated');

  const filtered = useMemo(() => {
    let list = projects ?? [];
    if (status !== 'all') list = list.filter((p) => p.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'created') sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sorted;
  }, [projects, search, status, sort]);

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
    return (
      <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center mb-5"
          style={{
            background: 'rgba(124,140,248, 0.08)',
            border: '1px solid rgba(124,140,248, 0.2)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <FolderPlus className="h-7 w-7" style={{ color: '#7c8cf8' }} />
        </div>
        <h3
          className="text-[16px] font-semibold mb-2"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
        >
          No projects yet
        </h3>
        <p
          className="text-[12px] mb-6 text-center max-w-[300px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}
        >
          Create your first project to start orchestrating AI agents.
        </p>
        <button
          type="button"
          onClick={onCreateProject}
          className="text-[13px] font-semibold px-5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 40,
            background: '#7c8cf8',
            color: '#021526',
            fontFamily: 'var(--font-sans)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          Create Project
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-secondary)' }} />
          <label className="sr-only" htmlFor="project-search">Search projects</label>
          <input
            id="project-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            autoComplete="off"
            style={{
              width: '100%', height: 36, padding: '0 32px 0 32px',
              background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13,
              borderRadius: 'var(--radius-md)', outline: 'none',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 6, borderRadius: 4 }}
            >
              <X style={{ width: 12, height: 12 }} aria-hidden="true" />
            </button>
          )}
        </div>

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
