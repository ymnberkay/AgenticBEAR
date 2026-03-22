import { FilePlus, FilePen, FileX } from 'lucide-react';
import type { FileChange, Agent } from '@subagent/shared';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/cn';

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
  if (!changes || changes.length === 0) {
    return (
      <div className="py-5 text-center text-[12px] text-text-disabled">
        No file changes recorded.
      </div>
    );
  }

  const agentMap = new Map(agents?.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-px">
      {changes.map((change) => {
        const op = opConfig[change.operation];
        const Icon = op.icon;
        const agent = agentMap.get(change.agentId);

        return (
          <div
            key={change.id}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-raised transition-colors duration-150"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: op.color }} />
            <span className="text-[12px] font-mono text-text-secondary truncate flex-1">
              {change.filePath}
            </span>
            <Badge
              color={op.color}
              className="shrink-0"
            >
              {op.label}
            </Badge>
            {agent && (
              <span
                className="text-[10px] shrink-0"
                style={{ color: agent.color }}
              >
                {agent.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
