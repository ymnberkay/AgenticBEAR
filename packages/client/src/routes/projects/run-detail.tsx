import { useParams } from '@tanstack/react-router';
import { useRun, useRunSteps, useRunFileChanges } from '../../api/hooks/use-runs';
import { useAgents } from '../../api/hooks/use-agents';
import { useSSE } from '../../hooks/use-sse';
import { RunControls } from '../../components/runs/run-controls';
import { RunTimeline } from '../../components/runs/run-timeline';
import { StreamingOutput } from '../../components/runs/streaming-output';
import { TokenUsageChart } from '../../components/runs/token-usage-chart';
import { FileChangeList } from '../../components/workspace/file-change-list';
import { Tabs } from '../../components/ui/tabs';
import { Skeleton } from '../../components/ui/skeleton';
import { formatCost, formatTokenCount } from '../../lib/format';

export function RunDetailPage() {
  const { projectId, runId } = useParams({ strict: false }) as {
    projectId: string;
    runId: string;
  };
  const { data: run, isLoading: runLoading } = useRun(runId);
  const { data: steps, isLoading: stepsLoading } = useRunSteps(runId);
  const { data: fileChanges } = useRunFileChanges(runId);
  const { data: agents } = useAgents(projectId);

  const isRunning = run?.status === 'running';
  useSSE(isRunning ? runId : null);

  if (runLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton height={40} />
        <Skeleton height={240} />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-[12px] text-[#5a5a5a]">Run not found</p>
      </div>
    );
  }

  const totalTokens = run.totalInputTokens + run.totalOutputTokens;

  return (
    <div className="flex flex-col gap-4">
      {/* Objective */}
      <div>
        <h3 className="text-[14px] font-medium text-[#cccccc] leading-relaxed">{run.objective}</h3>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-[#5a5a5a]">
          {totalTokens > 0 && (
            <span className="tabular-nums">{formatTokenCount(totalTokens)} tokens</span>
          )}
          {run.totalCostUsd > 0 && (
            <span className="tabular-nums">{formatCost(run.totalCostUsd)}</span>
          )}
        </div>
      </div>

      <RunControls run={run} />
      <StreamingOutput />

      <div className="h-px bg-[#2d2d2d]" />

      <Tabs
        tabs={[
          { id: 'timeline', label: 'Timeline' },
          { id: 'files', label: `Files (${fileChanges?.length ?? 0})` },
          { id: 'tokens', label: 'Tokens' },
        ]}
      >
        {(tabId) => {
          switch (tabId) {
            case 'timeline':
              return (
                <RunTimeline
                  steps={steps}
                  agents={agents}
                  isLoading={stepsLoading}
                />
              );
            case 'files':
              return (
                <FileChangeList changes={fileChanges} agents={agents} />
              );
            case 'tokens':
              return (
                <TokenUsageChart steps={steps} agents={agents} />
              );
            default:
              return null;
          }
        }}
      </Tabs>
    </div>
  );
}
