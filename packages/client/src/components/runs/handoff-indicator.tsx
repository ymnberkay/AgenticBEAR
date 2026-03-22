import { ArrowDown } from 'lucide-react';
import type { Agent } from '@subagent/shared';

interface HandoffIndicatorProps {
  fromAgent?: Agent;
  toAgent?: Agent;
}

export function HandoffIndicator({ fromAgent, toAgent }: HandoffIndicatorProps) {
  return (
    <div className="relative flex items-center gap-4 py-2 pl-3 overflow-hidden">
      {/* Dashed connector replacing the solid line segment */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-2 w-px" style={{ borderLeft: '1px dashed rgba(255, 255, 255, 0.1)' }} />
          <ArrowDown className="h-3 w-3 text-text-tertiary" />
          <div className="h-2 w-px" style={{ borderLeft: '1px dashed rgba(255, 255, 255, 0.1)' }} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary min-w-0 overflow-hidden">
        {fromAgent && (
          <span className="font-medium truncate max-w-[120px]" style={{ color: fromAgent.color }}>{fromAgent.name}</span>
        )}
        <span className="shrink-0">handed off to</span>
        {toAgent && (
          <span className="font-medium truncate max-w-[120px]" style={{ color: toAgent.color }}>{toAgent.name}</span>
        )}
      </div>
    </div>
  );
}
