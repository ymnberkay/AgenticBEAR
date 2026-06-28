import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileChange } from '@subagent/shared';
import { apiPost } from '../client';
import { workspaceKeys } from './use-workspace';

/** Approve a chat-staged file op → writes/deletes to disk + refreshes the workspace views. */
export function useApplyFileChange(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<FileChange>(`/api/projects/${projectId}/file-changes/${id}/apply`, {}),
    onSuccess: (fc) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.fileTree(projectId) });
      if (fc?.filePath) qc.invalidateQueries({ queryKey: workspaceKeys.fileContent(projectId, fc.filePath) });
    },
  });
}

/** Reject a chat-staged file op (discard; never touches disk). */
export function useRejectFileChange(projectId: string) {
  return useMutation({
    mutationFn: (id: string) => apiPost<FileChange>(`/api/projects/${projectId}/file-changes/${id}/reject`, {}),
  });
}
