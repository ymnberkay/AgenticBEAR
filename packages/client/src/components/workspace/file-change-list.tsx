import { useState, useMemo } from 'react';
import { FilePlus, FilePen, FileX, FileText } from 'lucide-react';
import type { FileChange, Agent } from '@subagent/shared';
import { Badge } from '../ui/badge';

interface FileChangeListProps {
  changes: FileChange[] | undefined;
  agents: Agent[] | undefined;
}

const opConfig = {
  create: { icon: FilePlus, color: 'var(--color-success)', label: 'Created' },
  modify: { icon: FilePen, color: 'var(--color-accent)', label: 'Modified' },
  delete: { icon: FileX, color: 'var(--color-error)', label: 'Deleted' },
};

export function FileChangeList({ changes, agents }: FileChangeListProps) {
  const [filter, setFilter] = useState<'all' | 'create' | 'modify' | 'delete'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  // 'command' ops are chat-approval shell commands, not file diffs — exclude them from this view.
  const fileChanges = useMemo(
    () => (changes ?? []).filter((c): c is typeof c & { operation: 'create' | 'modify' | 'delete' } => c.operation !== 'command'),
    [changes],
  );

  const counts = useMemo(() => {
    const c = { create: 0, modify: 0, delete: 0 };
    for (const change of fileChanges) c[change.operation]++;
    return c;
  }, [fileChanges]);

  const filtered = useMemo(() => {
    if (filter === 'all') return fileChanges;
    return fileChanges.filter((c) => c.operation === filter);
  }, [fileChanges, filter]);

  if (fileChanges.length === 0) {
    return (
      <div className="py-10 text-center flex flex-col items-center gap-2">
        <FileText style={{ width: 20, height: 20, color: 'var(--color-text-secondary)' }} aria-hidden="true" />
        <p style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>No file changes</p>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Files created, modified, or deleted during this run will appear here.
        </p>
      </div>
    );
  }

  const agentMap = new Map(agents?.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-2">
      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by operation">
        {([
          { id: 'all' as const, label: `All (${fileChanges.length})` },
          { id: 'create' as const, label: `+ ${counts.create}` },
          { id: 'modify' as const, label: `~ ${counts.modify}` },
          { id: 'delete' as const, label: `- ${counts.delete}` },
        ]).map((opt) => {
          const isActive = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              aria-pressed={isActive}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 28, padding: '0 10px',
                fontSize: 11, fontFamily: 'var(--font-mono)',
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

      {/* List */}
      <div className="flex flex-col gap-px" role="list">
        {filtered.map((change) => {
          const op = opConfig[change.operation];
          const Icon = op.icon;
          const agent = agentMap.get(change.agentId);
          const isOpen = expanded === change.id;
          return (
            <div
              key={change.id}
              role="listitem"
              className="flex flex-col"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <button
                type="button"
                onClick={() => setExpanded((cur) => (cur === change.id ? null : change.id))}
                aria-expanded={isOpen}
                className="flex items-center gap-2 px-3 py-2 text-left transition-colors duration-150 hover:bg-bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ minHeight: 36, borderRadius: 'var(--radius-sm)' }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: op.color }} aria-hidden="true" />
                <span className="text-[12px] font-mono text-text-primary truncate flex-1" title={change.filePath}>
                  {change.filePath}
                </span>
                <Badge color={op.color} className="shrink-0">{op.label}</Badge>
                {agent && (
                  <span
                    className="text-[10.5px] shrink-0 font-mono"
                    style={{ color: agent.color }}
                    title={agent.name}
                  >
                    {agent.name}
                  </span>
                )}
              </button>
              {isOpen && (
                <div
                  className="px-3 py-2 border-t border-border-subtle"
                  style={{ background: 'var(--color-bg-base)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
                >
                  {'previousContent' in change && (change as { previousContent?: string }).previousContent && (
                    <DiffPreview before={(change as { previousContent?: string }).previousContent ?? ''} after={(change as { newContent?: string }).newContent ?? ''} />
                  )}
                  {!('previousContent' in change) && (
                    <span>No diff data available for this change.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', padding: '12px 4px' }}>
            No {filter !== 'all' ? `${filter}d` : ''} changes.
          </span>
        )}
      </div>
    </div>
  );
}

function DiffPreview({ before, after }: { before: string; after: string }) {
  // Lightweight per-line diff: track added/removed counts without external dep.
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const max = Math.max(beforeLines.length, afterLines.length);
  let added = 0;
  let removed = 0;
  for (let i = 0; i < max; i++) {
    const a = beforeLines[i];
    const b = afterLines[i];
    if (a === undefined) added++;
    else if (b === undefined) removed++;
    else if (a !== b) { added++; removed++; }
  }
  return (
    <div className="flex items-center gap-3" aria-label="Change summary">
      <span style={{ color: 'var(--color-success)' }}>+{added}</span>
      <span style={{ color: 'var(--color-error)' }}>-{removed}</span>
      <span style={{ color: 'var(--color-text-secondary)' }}>
        ({beforeLines.length} → {afterLines.length} lines)
      </span>
    </div>
  );
}
