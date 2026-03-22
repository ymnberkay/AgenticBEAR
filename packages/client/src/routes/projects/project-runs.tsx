import { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { Plus, Play, Clock } from 'lucide-react';
import { useRuns, useCreateRun } from '../../api/hooks/use-runs';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Dialog } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { formatRelativeTime, formatCost, formatTokenCount } from '../../lib/format';

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  pending: 'default',
  running: 'info',
  paused: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

export function ProjectRunsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: runs, isLoading } = useRuns(projectId);
  const createRun = useCreateRun();
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const [objective, setObjective] = useState('');

  const handleCreateRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective.trim()) return;
    createRun.mutate(
      { projectId, objective: objective.trim() },
      {
        onSuccess: (run) => {
          setShowCreate(false);
          setObjective('');
          navigate({
            to: '/projects/$projectId/runs/$runId',
            params: { projectId, runId: run.id },
          });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={48} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase text-text-tertiary tracking-[0.08em]">
          Runs
          {runs && runs.length > 0 && (
            <span className="ml-1.5 text-text-disabled">({runs.length})</span>
          )}
        </span>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="h-3 w-3" />}
          onClick={() => setShowCreate(true)}
        >
          New Run
        </Button>
      </div>

      {(!runs || runs.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-border-default">
          <Play className="h-5 w-5 text-white/12 mb-2" />
          <p className="text-[12px] text-text-disabled mb-3">No runs yet</p>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            Create First Run
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() =>
                navigate({
                  to: '/projects/$projectId/runs/$runId',
                  params: { projectId, runId: run.id },
                })
              }
              className="flex items-center gap-2.5 bg-bg-raised border border-border-default hover:bg-bg-overlay hover:border-border-default px-3 py-2.5 text-left transition-all duration-150"
            >
              <Badge variant={statusVariant[run.status] ?? 'default'}>
                {run.status}
              </Badge>
              <span className="text-[12px] text-white/70 flex-1 truncate">
                {run.objective}
              </span>
              <div className="flex items-center gap-3 shrink-0 text-[11px] text-text-tertiary">
                {(run.totalInputTokens + run.totalOutputTokens) > 0 && (
                  <span className="tabular-nums">
                    {formatTokenCount(run.totalInputTokens + run.totalOutputTokens)}
                  </span>
                )}
                {run.totalCostUsd > 0 && (
                  <span className="tabular-nums">{formatCost(run.totalCostUsd)}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(run.createdAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Run"
      >
        <form onSubmit={handleCreateRun} className="flex flex-col gap-4">
          <Input
            label="Objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Build a REST API for user authentication with JWT tokens"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={createRun.isPending}
              disabled={!objective.trim()}
            >
              Create Run
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
