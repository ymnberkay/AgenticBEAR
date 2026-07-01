import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Issue, CreateIssueInput, IssueStatus, IssuePriority, IssuePullResult } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

const key = (projectId: string) => ['issues', projectId] as const;

export function useProjectIssues(projectId: string) {
  return useQuery({
    queryKey: key(projectId),
    queryFn: () => apiGet<Issue[]>(`/api/projects/${projectId}/issues`),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });
}

export function useCreateIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIssueInput) => apiPost<Issue>(`/api/projects/${projectId}/issues`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useUpdateIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: IssueStatus; priority?: IssuePriority; title?: string; description?: string; labels?: string[] }) =>
      apiPatch<Issue>(`/api/issues/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useDeleteIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/issues/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

/** Trigger an inbound pull from the project's linked tracker (currently Azure Boards). */
export function useSyncIssues(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<IssuePullResult>(`/api/projects/${projectId}/issues/sync`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export interface PushFailure { id: string; title: string; reason: string }
export interface PushUnsyncedResult {
  pushed: number;
  alreadySynced: number;
  failed: number;
  failures: PushFailure[];
  errors: string[];
}
/**
 * Push local issues to the linked tracker.
 *   - ids omitted → push every unsynced issue (backfill).
 *   - ids array   → retry exactly those (after a previous run failed on them).
 */
export function usePushIssues(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => apiPost<PushUnsyncedResult>(`/api/projects/${projectId}/issues/push`, ids ? { ids } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}
