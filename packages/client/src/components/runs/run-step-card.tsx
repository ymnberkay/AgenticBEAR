import { useState, type KeyboardEvent } from 'react';
import {
  MessageSquare, FileText, FilePen, ArrowRightLeft,
  Brain, AlertCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { RunStep, Agent } from '@subagent/shared';
import { formatTokenCount, formatDuration } from '../../lib/format';
import { Badge } from '../ui/badge';

const typeIcons: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  api_call: MessageSquare,
  file_read: FileText,
  file_write: FilePen,
  handoff: ArrowRightLeft,
  reasoning: Brain,
  error: AlertCircle,
};

const typeLabels: Record<string, string> = {
  api_call: 'API Call',
  file_read: 'File Read',
  file_write: 'File Write',
  handoff: 'Handoff',
  reasoning: 'Reasoning',
  error: 'Error',
};

interface RunStepCardProps {
  step: RunStep;
  agent?: Agent;
}

export function RunStepCard({ step, agent }: RunStepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = typeIcons[step.type] || MessageSquare;
  const totalTokens = step.inputTokens + step.outputTokens;
  const isError = step.type === 'error';

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded((v) => !v);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setExpanded(true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setExpanded(false);
    }
  };

  return (
    <div
      className="relative flex gap-4 py-3 pl-3"
      style={isError ? { borderLeft: '2px solid rgba(224,96,96,0.5)', marginLeft: -2 } : undefined}
    >
      {/* Node dot */}
      <div
        aria-hidden="true"
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center"
        style={{
          border: `1px solid ${isError ? 'rgba(224,96,96,0.5)' : agent ? `${agent.color}30` : 'var(--color-border-default)'}`,
          background: isError ? 'rgba(224,96,96,0.08)' : agent ? `${agent.color}08` : 'var(--color-bg-card)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <Icon
          className="h-4 w-4"
          style={isError ? { color: '#e06060' } : agent ? { color: agent.color } : { color: 'var(--color-text-secondary)' }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          onKeyDown={onKey}
          aria-expanded={expanded}
          aria-label={`${typeLabels[step.type] || step.type}${agent ? `, ${agent.name}` : ''}, ${expanded ? 'collapse' : 'expand'}`}
          className="flex items-center gap-2 w-full text-left group transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
          style={{ padding: '4px 2px' }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-text-secondary shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-secondary shrink-0" aria-hidden="true" />
          )}
          <span className="text-[13px] font-medium text-text-primary truncate">
            {typeLabels[step.type] || step.type}
          </span>
          {agent && (
            <span className="text-[11px] text-text-secondary truncate shrink-0 max-w-[120px]">{agent.name}</span>
          )}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {totalTokens > 0 && (
              <span className="text-[10.5px] text-text-secondary whitespace-nowrap">
                {formatTokenCount(totalTokens)} tokens
              </span>
            )}
            <span className="text-[10.5px] text-text-secondary whitespace-nowrap" title="Duration">
              {step.durationMs > 0 ? formatDuration(step.durationMs) : '<1ms'}
            </span>
            {isError && <Badge variant="error">Error</Badge>}
          </div>
        </button>

        {/* Preview (always show truncated) */}
        {!expanded && step.output && (
          <p className="text-[11.5px] text-text-secondary truncate mt-1 pl-5">
            {step.output.slice(0, 120)}
          </p>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="mt-2 pl-5 flex flex-col gap-2">
            {step.input && (
              <div>
                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                  Input
                </span>
                <div
                  className="mt-1 p-3 text-[12px] font-mono text-text-primary whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {step.input}
                </div>
              </div>
            )}
            {step.output && (
              <div>
                <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                  Output
                </span>
                <div
                  className="mt-1 p-3 text-[12px] font-mono text-text-primary whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
                  style={{
                    background: isError ? 'rgba(224,96,96,0.06)' : 'var(--color-bg-card)',
                    border: isError ? '1px solid rgba(224,96,96,0.25)' : '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {step.output}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap text-[10.5px] text-text-secondary pt-1">
              <span>Input: {formatTokenCount(step.inputTokens)}</span>
              <span>Output: {formatTokenCount(step.outputTokens)}</span>
              <span>Cost: ${step.costUsd.toFixed(4)}</span>
              <span>Duration: {step.durationMs > 0 ? formatDuration(step.durationMs) : '<1ms'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
