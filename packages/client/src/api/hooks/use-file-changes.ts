import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileChange } from '@subagent/shared';
import { apiGet, apiPost } from '../client';
import { workspaceKeys } from './use-workspace';

const pendingKey = (projectId: string) => ['file-changes', 'pending', projectId] as const;

/**
 * Chat-staged file ops awaiting approval — read from the SERVER so they survive navigating away
 * and back (the agent turn finishes server-side and records them even if the user left the page).
 * Polled so a turn that completes in the background surfaces its approvals.
 */
export function usePendingFileChanges(projectId: string) {
  return useQuery({
    queryKey: pendingKey(projectId),
    queryFn: () => apiGet<FileChange[]>(`/api/projects/${projectId}/file-changes/pending`),
    enabled: !!projectId,
    refetchInterval: 8_000,
  });
}

/** Apply response — for `command` ops the server returns the command's combined output. */
export type AppliedFileChange = FileChange & { commandOutput?: string };

/** Approve a chat-staged file op → writes/deletes/runs + refreshes workspace + pending views. */
export function useApplyFileChange(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<AppliedFileChange>(`/api/projects/${projectId}/file-changes/${id}/apply`, {}),
    onSuccess: (fc) => {
      qc.invalidateQueries({ queryKey: pendingKey(projectId) });
      qc.invalidateQueries({ queryKey: workspaceKeys.fileTree(projectId) });
      if (fc?.filePath) qc.invalidateQueries({ queryKey: workspaceKeys.fileContent(projectId, fc.filePath) });
    },
  });
}

/** Reject a chat-staged file op (discard; never touches disk). */
export function useRejectFileChange(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<FileChange>(`/api/projects/${projectId}/file-changes/${id}/reject`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: pendingKey(projectId) }),
  });
}
