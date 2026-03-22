import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

const agentKeys = {
  all: ['agents'] as const,
  list: (projectId: string) => [...agentKeys.all, 'list', projectId] as const,
  detail: (id: string) => [...agentKeys.all, 'detail', id] as const,
};

export function useAgents(projectId: string) {
  return useQuery({
    queryKey: agentKeys.list(projectId),
    queryFn: () => apiGet<Agent[]>(`/api/projects/${projectId}/agents`),
    enabled: !!projectId,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => apiGet<Agent>(`/api/agents/${id}`),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) =>
      apiPost<Agent>('/api/agents', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.list(data.projectId) });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAgentInput & { id: string }) =>
      apiPatch<Agent>(`/api/agents/${id}`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.list(data.projectId) });
      queryClient.setQueryData(agentKeys.detail(data.id), data);
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
      apiDelete(`/api/agents/${id}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.list(projectId) });
    },
  });
}
