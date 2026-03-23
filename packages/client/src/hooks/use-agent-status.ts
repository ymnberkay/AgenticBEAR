import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAgentStatusStore } from '../stores/agent-status.store';

export function useAgentStatus(projectId: string) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const { setStatus, resetAll } = useAgentStatusStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;

    // Connect to project-level SSE
    const es = new EventSource(`/api/events/project/${projectId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        const type = data.type as string;
        const agentId = data.agentId as string | undefined;

        if (!agentId) return;

        if (type === 'agent:started') {
          setStatus(agentId, 'running');
        } else if (type === 'agent:completed') {
          setStatus(agentId, 'completed');
          // Invalidate agent activities cache
          queryClient.invalidateQueries({ queryKey: ['agents', 'activities', agentId] });
          // Reset to idle after 3 seconds
          setTimeout(() => setStatus(agentId, 'idle'), 3000);
        } else if (type === 'agent:failed') {
          setStatus(agentId, 'idle');
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      resetAll();
    };
  }, [projectId, setStatus, resetAll, queryClient]);
}
