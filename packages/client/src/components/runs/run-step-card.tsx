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
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          border: `1px solid ${agent ? `${agent.color}30` : 'rgba(255, 255, 255, 0.08)'}`,
          background: agent ? `${agent.color}08` : 'rgba(255, 255, 255, 0.03)',
        }}
      >
        <Icon
          className="h-4 w-4"
          style={agent ? { color: agent.color } : { color: '#5a5a6e' }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left group transition-colors duration-200"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-[#5a5a6e] shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[#5a5a6e] shrink-0" />
          )}
          <span className="text-[13px] font-medium text-[#e2e2e8] truncate">
            {typeLabels[step.type] || step.type}
          </span>
          {agent && (
            <span className="text-[11px] text-[#5a5a6e] truncate shrink-0 max-w-[120px]">{agent.name}</span>
          )}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {totalTokens > 0 && (
              <span className="text-[10px] text-[#5a5a6e] whitespace-nowrap">
                {formatTokenCount(totalTokens)} tokens
              </span>
            )}
            {step.durationMs > 0 && (
              <span className="text-[10px] text-[#5a5a6e] whitespace-nowrap">
                {formatDuration(step.durationMs)}
              </span>
            )}
            {step.type === 'error' && <Badge variant="error">Error</Badge>}
          </div>
        </button>

        {/* Preview (always show truncated) */}
        {!expanded && step.output && (
          <p className="text-[11px] text-[#5a5a6e] truncate mt-1 pl-5">
            {step.output.slice(0, 120)}
          </p>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="mt-2 pl-5 flex flex-col gap-2">
            {step.input && (
              <div>
                <span className="text-[10px] font-semibold text-[#5a5a6e] uppercase tracking-wider">
                  Input
                </span>
                <div
                  className="mt-1 rounded-xl p-3 text-[12px] font-mono text-[#8b8b9e] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {step.input}
                </div>
              </div>
            )}
            {step.output && (
              <div>
                <span className="text-[10px] font-semibold text-[#5a5a6e] uppercase tracking-wider">
                  Output
                </span>
                <div
                  className="mt-1 rounded-xl p-3 text-[12px] font-mono text-[#8b8b9e] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {step.output}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap text-[10px] text-[#5a5a6e] pt-1">
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
