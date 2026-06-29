import { useParams, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
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
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-[12px] text-text-primary">Run not found</p>
        <p className="text-[11px] text-text-secondary">The run may have been deleted or you may not have access.</p>
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 32, padding: '0 14px', marginTop: 4,
            background: 'var(--color-bg-raised)', color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)', fontSize: 12, textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 12, height: 12 }} aria-hidden="true" /> Back to project
        </Link>
      </div>
    );
  }

  const totalTokens = run.totalInputTokens + run.totalOutputTokens;

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <Link
        to="/projects/$projectId"
        params={{ projectId }}
        className="inline-flex items-center gap-1.5 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-secondary)', textDecoration: 'none',
          padding: '4px 6px', borderRadius: 'var(--radius-sm)',
        }}
      >
        <ArrowLeft style={{ width: 11, height: 11 }} aria-hidden="true" /> Back to project
      </Link>
      {/* Objective */}
      <div>
        <h3 className="text-[14px] font-medium text-text-primary leading-relaxed">{run.objective}</h3>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-text-tertiary">
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

      <div className="h-px bg-bg-raised" />

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
