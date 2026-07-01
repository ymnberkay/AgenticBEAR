import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../client';

// Server shapes — see server/src/services/git-workspace.service.ts.
export interface GitStatusEntry { path: string; index: string; work: string }
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
}
export interface GitBranches { current: string; local: string[]; remote: string[] }

/** Ok/error envelope both endpoints return so we can render inline error state instead of throwing. */
type Envelope<T> = { ok: true } & T | { ok: false; error?: string };

export function useGitStatus(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['git-status', projectId],
    queryFn: () => apiGet<Envelope<{ status: GitStatus }>>(`/api/projects/${projectId}/git/status`),
    enabled: enabled && !!projectId,
    refetchInterval: 15_000,
  });
}

export function useGitBranches(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['git-branches', projectId],
    queryFn: () => apiGet<Envelope<{ branches: GitBranches }>>(`/api/projects/${projectId}/git/branches`),
    enabled: enabled && !!projectId,
    // Static-ish, no need for aggressive refetching.
    refetchInterval: 30_000,
  });
}

/** Switch branches (or create + switch when create=true). */
export function useGitCheckout(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { branch: string; create?: boolean }) =>
      apiPost<{ ok: true; branch: string }>(`/api/projects/${projectId}/git/checkout`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-status', projectId] });
      qc.invalidateQueries({ queryKey: ['git-branches', projectId] });
    },
  });
}
