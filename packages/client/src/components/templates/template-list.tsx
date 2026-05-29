import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
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

interface TemplateListProps {
  templates: PromptTemplate[] | undefined;
  isLoading: boolean;
  onSelect: (template: PromptTemplate) => void;
}

export function TemplateList({ templates, isLoading, onSelect }: TemplateListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
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
      <div className="py-16 text-center text-[12px] text-text-disabled">
        No templates available.
      </div>
    );
  }

  const grouped = new Map<TemplateCategory, PromptTemplate[]>();
  for (const tmpl of templates) {
    const list = grouped.get(tmpl.category) ?? [];
    list.push(tmpl);
    grouped.set(tmpl.category, list);
  }

  return (
    <div className="flex flex-col gap-8">
      {categoryOrder
        .filter((cat) => grouped.has(cat))
        .map((category) => (
          <section key={category}>
            {/* Category header */}
            <div className="flex items-center gap-3 mb-4">
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-text-disabled)',
                }}
              >
                {categoryLabel[category] ?? category}
              </span>
              <div className="flex-1" style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
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
                    onClick={() => onSelect(template)}
                  />
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}

function TemplateCard({
  template,
  icon,
  color,
  onClick,
}: {
  template: PromptTemplate;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left w-full transition-all duration-150"
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: `3px solid var(--color-border-subtle)`,
        padding: '14px 16px',
        cursor: 'pointer',
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
      {/* Top row: icon + name + badge */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center mt-0.5"
          style={{ backgroundColor: `${color}18`, color }}
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
            {template.isBuiltIn && (
              <Badge variant="info">Built-in</Badge>
            )}
          </div>
          {template.description && (
            <p
              className="mt-1.5 line-clamp-2 leading-relaxed"
              style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}
            >
              {template.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
