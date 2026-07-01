import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectGoal, CreateGoalInput, UpdateGoalInput, BulkCreateGoalsResult } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

const key = (projectId: string) => ['goals', projectId] as const;

export function useProjectGoals(projectId: string) {
  return useQuery({
    queryKey: key(projectId),
    queryFn: () => apiGet<ProjectGoal[]>(`/api/projects/${projectId}/goals`),
    enabled: !!projectId,
  });
}

export function useCreateGoal(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => apiPost<ProjectGoal>(`/api/projects/${projectId}/goals`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

/** Bulk insert — used by the Excel/CSV import flow + the multi-line paste form. */
export function useBulkCreateGoals(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { goals: CreateGoalInput[]; source?: 'excel' | 'user' }) =>
      apiPost<BulkCreateGoalsResult>(`/api/projects/${projectId}/goals/bulk`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useUpdateGoal(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & UpdateGoalInput) =>
      apiPatch<ProjectGoal>(`/api/goals/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useReorderGoals(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: Array<{ id: string; orderIndex: number }>) =>
      apiPatch<{ ok: true }>(`/api/projects/${projectId}/goals/reorder`, { order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useDeleteGoal(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/goals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}
