import { useMemo, useState } from 'react';
import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot, Search, X, Pencil, Copy,
} from 'lucide-react';
import type { PromptTemplate, TemplateCategory } from '@subagent/shared';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { AGENT_COLORS } from '@subagent/shared';

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
};

const categoryOrder: TemplateCategory[] = [
  'orchestrator', 'backend', 'frontend', 'database',
  'devops', 'qa', 'documentation', 'design', 'custom',
];

const categoryLabel: Partial<Record<TemplateCategory, string>> = {
  orchestrator: 'Orchestrator',
  backend: 'Backend',
  frontend: 'Frontend',
  database: 'Database',
  devops: 'DevOps',
  qa: 'QA',
  documentation: 'Documentation',
  design: 'Design',
  custom: 'Custom',
};

type FilterScope = 'all' | 'builtin' | 'custom';
type SortKey = 'name' | 'recent';

interface TemplateListProps {
  templates: PromptTemplate[] | undefined;
  isLoading: boolean;
  onSelect: (template: PromptTemplate) => void;
  onDuplicate?: (template: PromptTemplate) => void;
}

export function TemplateList({ templates, isLoading, onSelect, onDuplicate }: TemplateListProps) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<FilterScope>('all');
  const [sort, setSort] = useState<SortKey>('name');

  const filtered = useMemo(() => {
    let list = templates ?? [];
    if (scope === 'builtin') list = list.filter((t) => t.isBuiltIn);
    else if (scope === 'custom') list = list.filter((t) => !t.isBuiltIn);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [templates, scope, search]);

  const grouped = useMemo(() => {
    const map = new Map<TemplateCategory, PromptTemplate[]>();
    for (const tmpl of filtered) {
      const list = map.get(tmpl.category) ?? [];
      list.push(tmpl);
      map.set(tmpl.category, list);
    }
    for (const list of map.values()) {
      if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [filtered, sort]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8" role="status" aria-live="polite" aria-label="Loading templates">
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g}>
            <Skeleton height={16} className="mb-4 w-24" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={110} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="py-16 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>No templates yet</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Create your first template to share a prompt across projects.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--color-text-secondary)' }} />
          <label className="sr-only" htmlFor="template-search">Search templates</label>
          <input
            id="template-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            autoComplete="off"
            style={{
              width: '100%', height: 36, padding: '0 32px',
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

        <div className="flex items-center gap-1" role="group" aria-label="Filter templates">
          {([
            { id: 'all' as const, label: `All (${templates.length})` },
            { id: 'builtin' as const, label: 'Built-in' },
            { id: 'custom' as const, label: 'Custom' },
          ]).map((opt) => {
            const isActive = scope === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScope(opt.id)}
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
          <span className="sr-only">Sort templates</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort templates"
            style={{
              height: 32, padding: '0 8px', background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 11.5, borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            <option value="name">Name (A→Z)</option>
            <option value="recent">As received</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          No templates match the current filters.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {categoryOrder
            .filter((cat) => grouped.has(cat))
            .map((category) => (
              <section key={category}>
                {/* Category header */}
                <div className="flex items-center gap-3 mb-4">
                  <h2
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--color-text-secondary)',
                      margin: 0,
                    }}
                  >
                    {categoryLabel[category] ?? category}
                  </h2>
                  <div className="flex-1" style={{ height: '1px', background: 'var(--color-border-subtle)' }} aria-hidden="true" />
                </div>

                {/* Template grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {grouped.get(category)!.map((template) => {
                    const Icon = iconMap[template.suggestedIcon] || Bot;
                    const color = template.suggestedColor || AGENT_COLORS[category] || AGENT_COLORS.custom;

                    return (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        icon={<Icon className="h-4 w-4" />}
                        color={color}
                        onSelect={() => onSelect(template)}
                        onDuplicate={onDuplicate ? () => onDuplicate(template) : undefined}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  icon,
  color,
  onSelect,
  onDuplicate,
}: {
  template: PromptTemplate;
  icon: React.ReactNode;
  color: string;
  onSelect: () => void;
  onDuplicate?: () => void;
}) {
  return (
    <div
      role="group"
      className="group relative"
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: `3px solid var(--color-border-subtle)`,
        borderRadius: 'var(--radius-md)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-raised)';
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
        e.currentTarget.style.borderLeftColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-surface)';
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.borderLeftColor = 'var(--color-border-subtle)';
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${template.isBuiltIn ? 'Open built-in template' : 'Edit template'} ${template.name}`}
        className="text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          padding: '14px 16px', cursor: 'pointer', background: 'transparent', border: 'none',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center mt-0.5"
            style={{ backgroundColor: `${color}18`, color, borderRadius: 'var(--radius-md)' }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-medium truncate"
                style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}
              >
                {template.name}
              </span>
              {template.isBuiltIn ? (
                <Badge variant="info">Built-in</Badge>
              ) : (
                <Badge variant="default">Custom</Badge>
              )}
            </div>
            {template.description && (
              <p
                className="mt-1.5 line-clamp-2 leading-relaxed"
                style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)' }}
              >
                {template.description}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Hover/focus actions */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
        {onDuplicate && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            aria-label={`Duplicate template ${template.name}`}
            title="Duplicate"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              width: 28, height: 28,
              background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)', borderRadius: 4, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Copy style={{ width: 12, height: 12 }} aria-hidden="true" />
          </button>
        )}
        {!template.isBuiltIn && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            aria-label={`Edit template ${template.name}`}
            title="Edit"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              width: 28, height: 28,
              background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)', borderRadius: 4, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Pencil style={{ width: 12, height: 12 }} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
