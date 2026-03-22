import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Run, CreateRunInput, Task, RunStep, FileChange } from '@subagent/shared';
import { apiGet, apiPost } from '../client';

export const runKeys = {
  all: ['runs'] as const,
  list: (projectId: string) => [...runKeys.all, 'list', projectId] as const,
  detail: (id: string) => [...runKeys.all, 'detail', id] as const,
  tasks: (runId: string) => [...runKeys.all, 'tasks', runId] as const,
  steps: (runId: string) => [...runKeys.all, 'steps', runId] as const,
  fileChanges: (runId: string) => [...runKeys.all, 'fileChanges', runId] as const,
};

export function useRuns(projectId: string) {
  return useQuery({
    queryKey: runKeys.list(projectId),
    queryFn: () => apiGet<Run[]>(`/api/projects/${projectId}/runs`),
    enabled: !!projectId,
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: runKeys.detail(id),
    queryFn: () => apiGet<Run>(`/api/runs/${id}`),
    enabled: !!id,
  });
}

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRunInput) =>
      apiPost<Run>('/api/runs', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: runKeys.list(data.projectId) });
    },
  });
}

export function useStartRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<Run>(`/api/runs/${id}/start`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: runKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: runKeys.list(data.projectId) });
    },
  });
}

export function usePauseRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<Run>(`/api/runs/${id}/pause`),
    onSuccess: (data) => {
      queryClient.setQueryData(runKeys.detail(data.id), data);
    },
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<Run>(`/api/runs/${id}/cancel`),
    onSuccess: (data) => {
      queryClient.setQueryData(runKeys.detail(data.id), data);
    },
  });
}

export function useRunTasks(runId: string) {
  return useQuery({
    queryKey: runKeys.tasks(runId),
    queryFn: () => apiGet<Task[]>(`/api/runs/${runId}/tasks`),
    enabled: !!runId,
  });
}

export function useRunSteps(runId: string) {
  return useQuery({
    queryKey: runKeys.steps(runId),
    queryFn: () => apiGet<RunStep[]>(`/api/runs/${runId}/steps`),
    enabled: !!runId,
  });
}

export function useRunFileChanges(runId: string) {
  return useQuery({
    queryKey: runKeys.fileChanges(runId),
    queryFn: () => apiGet<FileChange[]>(`/api/runs/${runId}/file-changes`),
    enabled: !!runId,
  });
}
