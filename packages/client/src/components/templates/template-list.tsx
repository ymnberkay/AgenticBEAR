import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
} from 'lucide-react';
import type { PromptTemplate, TemplateCategory } from '@subagent/shared';
import { Card } from '../ui/card';
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

interface TemplateListProps {
  templates: PromptTemplate[] | undefined;
  isLoading: boolean;
  onSelect: (template: PromptTemplate) => void;
}

export function TemplateList({ templates, isLoading, onSelect }: TemplateListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={100} />
        ))}
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="py-10 text-center text-[12px] text-white/20">
        No templates available.
      </div>
    );
  }

  // Group by category
  const grouped = new Map<TemplateCategory, PromptTemplate[]>();
  for (const tmpl of templates) {
    const list = grouped.get(tmpl.category) ?? [];
    list.push(tmpl);
    grouped.set(tmpl.category, list);
  }

  return (
    <div className="flex flex-col gap-6">
      {categoryOrder
        .filter((cat) => grouped.has(cat))
        .map((category) => (
          <div key={category}>
            <h3 className="text-[10px] font-medium uppercase text-white/20 tracking-[0.08em] mb-2.5">
              {category}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {grouped.get(category)!.map((template) => {
                const Icon = iconMap[template.suggestedIcon] || Bot;
                const color = template.suggestedColor || AGENT_COLORS[category] || AGENT_COLORS.custom;

                return (
                  <Card
                    key={template.id}
                    hoverable
                    onClick={() => onSelect(template)}
                    className="group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                        style={{
                          backgroundColor: `${color}15`,
                          color,
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[13px] font-medium text-white/80 truncate">
                            {template.name}
                          </span>
                          {template.isBuiltIn && (
                            <Badge variant="info">Built-in</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-white/20 line-clamp-2">
                          {template.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
