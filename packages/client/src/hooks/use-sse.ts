import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createSSEConnection } from '../api/sse';
import { useRunStore } from '../stores/run.store';
import { runKeys } from '../api/hooks/use-runs';

export function useSSE(runId: string | null) {
  const queryClient = useQueryClient();
  const connectionRef = useRef<ReturnType<typeof createSSEConnection> | null>(null);
  const { startStreaming, appendChunk, pushEvent, stopStreaming } = useRunStore();

  useEffect(() => {
    if (!runId) return;

    startStreaming(runId);
    const connection = createSSEConnection(runId);
    connectionRef.current = connection;

    connection.addEventListener('message', (event) => {
      pushEvent(event);

      switch (event.type) {
        case 'step:output_chunk':
          appendChunk((event.data as { chunk?: string }).chunk ?? '');
          break;

        case 'run:completed':
        case 'run:failed':
        case 'run:cancelled':
          stopStreaming();
          queryClient.invalidateQueries({ queryKey: runKeys.detail(runId) });
          queryClient.invalidateQueries({ queryKey: runKeys.steps(runId) });
          queryClient.invalidateQueries({ queryKey: runKeys.tasks(runId) });
          queryClient.invalidateQueries({ queryKey: runKeys.fileChanges(runId) });
          break;

        case 'run:paused':
          stopStreaming();
          queryClient.invalidateQueries({ queryKey: runKeys.detail(runId) });
          break;

        case 'task:completed':
        case 'task:started':
        case 'task:created':
        case 'task:failed':
          queryClient.invalidateQueries({ queryKey: runKeys.tasks(runId) });
          break;

        case 'step:completed':
        case 'step:started':
          queryClient.invalidateQueries({ queryKey: runKeys.steps(runId) });
          break;

        case 'file:changed':
          queryClient.invalidateQueries({ queryKey: runKeys.fileChanges(runId) });
          break;

        case 'tokens:updated':
          queryClient.invalidateQueries({ queryKey: runKeys.detail(runId) });
          break;
      }
    });

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [runId, queryClient, startStreaming, appendChunk, pushEvent, stopStreaming]);

  return connectionRef;
}
