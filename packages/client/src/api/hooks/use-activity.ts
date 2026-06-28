import { useQuery } from '@tanstack/react-query';
import type { ActivityLogEntry } from '@subagent/shared';
import { apiGet } from '../client';

/** Per-project audit trail (Activity tab). */
export function useProjectActivity(projectId: string) {
  return useQuery({
    queryKey: ['activity', projectId],
    queryFn: () => apiGet<ActivityLogEntry[]>(`/api/projects/${projectId}/activity`),
    enabled: !!projectId,
    refetchInterval: 20_000,
  });
}
