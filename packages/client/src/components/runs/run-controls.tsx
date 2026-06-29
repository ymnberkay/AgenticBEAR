import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Clock } from 'lucide-react';
import type { Run } from '@subagent/shared';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog } from '../ui/dialog';
import { useToast } from '../ui/toast';
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
  const { show: showToast } = useToast();
  const [elapsed, setElapsed] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Lock action buttons during the brief window between click and the run.status updating
  // from the server, so rapid clicks can't queue multiple start/pause/cancel calls.
  const [transitioning, setTransitioning] = useState(false);
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

  // Clear the transitioning lock whenever the server-reported status changes.
  useEffect(() => {
    setTransitioning(false);
  }, [run.status]);

  const status = statusConfig[run.status] ?? statusConfig.pending;
  const isRunning = run.status === 'running';
  const isPending = run.status === 'pending';
  const isPaused = run.status === 'paused';
  const isFinished = ['completed', 'failed', 'cancelled'].includes(run.status);

  const startAction = () => {
    if (transitioning || startRun.isPending) return;
    setTransitioning(true);
    startRun.mutate(run.id, {
      onError: (err) => {
        setTransitioning(false);
        showToast(err instanceof Error ? err.message : 'Failed to start', { variant: 'error' });
      },
    });
  };

  const pauseAction = () => {
    if (transitioning || pauseRun.isPending) return;
    setTransitioning(true);
    pauseRun.mutate(run.id, {
      onError: (err) => {
        setTransitioning(false);
        showToast(err instanceof Error ? err.message : 'Failed to pause', { variant: 'error' });
      },
    });
  };

  const cancelAction = () => {
    setConfirmCancel(false);
    if (transitioning || cancelRun.isPending) return;
    setTransitioning(true);
    cancelRun.mutate(run.id, {
      onSuccess: () => showToast('Run cancelled', { variant: 'info' }),
      onError: (err) => {
        setTransitioning(false);
        showToast(err instanceof Error ? err.message : 'Failed to cancel', { variant: 'error' });
      },
    });
  };

  return (
    <div
      className="flex items-center justify-between px-5 py-4 transition-all duration-200 flex-wrap gap-3"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Badge variant={status.variant}>{status.label}</Badge>
        {(isRunning || isFinished) && elapsed > 0 && (
          <div
            className="flex items-center gap-1 text-[11px] text-text-secondary whitespace-nowrap"
            aria-live={isRunning ? 'polite' : 'off'}
            aria-atomic="true"
          >
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">Elapsed </span>
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
            onClick={startAction}
            loading={startRun.isPending || transitioning}
            disabled={startRun.isPending || transitioning}
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
              onClick={pauseAction}
              loading={pauseRun.isPending || transitioning}
              disabled={pauseRun.isPending || transitioning}
            >
              Pause
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Square className="h-3.5 w-3.5" />}
              onClick={() => setConfirmCancel(true)}
              loading={cancelRun.isPending || transitioning}
              disabled={cancelRun.isPending || transitioning}
            >
              Cancel
            </Button>
          </>
        )}
      </div>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this run?"
        description="In-flight work will be lost. Progress so far is preserved but no further steps will execute."
        maxWidth="420px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmCancel(false)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Keep running
          </button>
          <button
            type="button"
            onClick={cancelAction}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel run
          </button>
        </div>
      </Dialog>
    </div>
  );
}
