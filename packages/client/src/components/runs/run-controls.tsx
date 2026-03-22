import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Clock } from 'lucide-react';
import type { Run } from '@subagent/shared';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatDuration } from '../../lib/format';
import { useStartRun, usePauseRun, useCancelRun } from '../../api/hooks/use-runs';

interface RunControlsProps {
  run: Run;
}

const statusConfig: Record<string, { variant: 'success' | 'warning' | 'error' | 'info' | 'default'; label: string }> = {
  pending: { variant: 'default', label: 'Pending' },
  running: { variant: 'info', label: 'Running' },
  paused: { variant: 'warning', label: 'Paused' },
  completed: { variant: 'success', label: 'Completed' },
  failed: { variant: 'error', label: 'Failed' },
  cancelled: { variant: 'default', label: 'Cancelled' },
};

export function RunControls({ run }: RunControlsProps) {
  const startRun = useStartRun();
  const pauseRun = usePauseRun();
  const cancelRun = useCancelRun();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (run.status === 'running' && run.startedAt) {
      const start = new Date(run.startedAt).getTime();
      const tick = () => setElapsed(Date.now() - start);
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => clearInterval(intervalRef.current);
    }
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      if (run.startedAt && run.completedAt) {
        setElapsed(
          new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
        );
      }
    }
  }, [run.status, run.startedAt, run.completedAt]);

  const status = statusConfig[run.status] ?? statusConfig.pending;
  const isRunning = run.status === 'running';
  const isPending = run.status === 'pending';
  const isPaused = run.status === 'paused';
  const isFinished = ['completed', 'failed', 'cancelled'].includes(run.status);

  return (
    <div
      className="flex items-center justify-between px-5 py-4 transition-all duration-200 flex-wrap gap-3"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Badge variant={status.variant}>{status.label}</Badge>
        {(isRunning || isFinished) && elapsed > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-text-secondary whitespace-nowrap">
            <Clock className="h-3 w-3 shrink-0" />
            {formatDuration(elapsed)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {(isPending || isPaused) && (
          <Button
            variant="primary"
            size="sm"
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={() => startRun.mutate(run.id)}
            loading={startRun.isPending}
          >
            {isPaused ? 'Resume' : 'Start'}
          </Button>
        )}
        {isRunning && (
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Pause className="h-3.5 w-3.5" />}
              onClick={() => pauseRun.mutate(run.id)}
              loading={pauseRun.isPending}
            >
              Pause
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Square className="h-3.5 w-3.5" />}
              onClick={() => cancelRun.mutate(run.id)}
              loading={cancelRun.isPending}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
