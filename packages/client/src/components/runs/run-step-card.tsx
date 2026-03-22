import { useState } from 'react';
import {
  MessageSquare, FileText, FilePen, ArrowRightLeft,
  Brain, AlertCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { RunStep, Agent } from '@subagent/shared';
import { formatTokenCount, formatDuration } from '../../lib/format';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/cn';

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

  return (
    <div className="relative flex gap-4 py-3 pl-3">
      {/* Node dot */}
      <div
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center"
        style={{
          border: `1px solid ${agent ? `${agent.color}30` : 'var(--color-border-default)'}`,
          background: agent ? `${agent.color}08` : 'var(--color-bg-card)',
        }}
      >
        <Icon
          className="h-4 w-4"
          style={agent ? { color: agent.color } : { color: 'var(--color-text-tertiary)' }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left group transition-colors duration-200"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-text-tertiary shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-tertiary shrink-0" />
          )}
          <span className="text-[13px] font-medium text-text-primary truncate">
            {typeLabels[step.type] || step.type}
          </span>
          {agent && (
            <span className="text-[11px] text-text-tertiary truncate shrink-0 max-w-[120px]">{agent.name}</span>
          )}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {totalTokens > 0 && (
              <span className="text-[10px] text-text-tertiary whitespace-nowrap">
                {formatTokenCount(totalTokens)} tokens
              </span>
            )}
            {step.durationMs > 0 && (
              <span className="text-[10px] text-text-tertiary whitespace-nowrap">
                {formatDuration(step.durationMs)}
              </span>
            )}
            {step.type === 'error' && <Badge variant="error">Error</Badge>}
          </div>
        </button>

        {/* Preview (always show truncated) */}
        {!expanded && step.output && (
          <p className="text-[11px] text-text-tertiary truncate mt-1 pl-5">
            {step.output.slice(0, 120)}
          </p>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="mt-2 pl-5 flex flex-col gap-2">
            {step.input && (
              <div>
                <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Input
                </span>
                <div
                  className="mt-1 p-3 text-[12px] font-mono text-text-secondary whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {step.input}
                </div>
              </div>
            )}
            {step.output && (
              <div>
                <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Output
                </span>
                <div
                  className="mt-1 p-3 text-[12px] font-mono text-text-secondary whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
                  style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {step.output}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap text-[10px] text-text-tertiary pt-1">
              <span>Input: {formatTokenCount(step.inputTokens)}</span>
              <span>Output: {formatTokenCount(step.outputTokens)}</span>
              <span>Cost: ${step.costUsd.toFixed(4)}</span>
              <span>Duration: {formatDuration(step.durationMs)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
