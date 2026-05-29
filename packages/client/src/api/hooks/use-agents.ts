import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Agent, CreateAgentInput, UpdateAgentInput, Task, AgentActivity, AgentMemory } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

const agentKeys = {
  all: ['agents'] as const,
  list: (projectId: string) => [...agentKeys.all, 'list', projectId] as const,
  detail: (id: string) => [...agentKeys.all, 'detail', id] as const,
  tasks: (id: string) => [...agentKeys.all, 'tasks', id] as const,
  activities: (id: string) => [...agentKeys.all, 'activities', id] as const,
  memories: (id: string) => [...agentKeys.all, 'memories', id] as const,
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

export function useAgentTasks(agentId: string) {
  return useQuery({
    queryKey: agentKeys.tasks(agentId),
    queryFn: () => apiGet<Task[]>(`/api/agents/${agentId}/tasks`),
    enabled: !!agentId,
  });
}

export function useAgentActivities(agentId: string) {
  return useQuery({
    queryKey: agentKeys.activities(agentId),
    queryFn: () => apiGet<AgentActivity[]>(`/api/agents/${agentId}/activities`),
    enabled: !!agentId,
    refetchInterval: 4000,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...rest }: CreateAgentInput) =>
      apiPost<Agent>(`/api/projects/${projectId}/agents`, rest),
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

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; agentId: string }) =>
      apiDelete(`/api/activities/${id}`),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.activities(agentId) });
    },
  });
}

export function useClearActivities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      apiDelete(`/api/agents/${agentId}/activities`),
    onSuccess: (_, agentId) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.activities(agentId) });
    },
  });
}

export function useAgentMemories(agentId: string) {
  return useQuery({
    queryKey: agentKeys.memories(agentId),
    queryFn: () => apiGet<AgentMemory[]>(`/api/agents/${agentId}/memories`),
    enabled: !!agentId,
    refetchInterval: 4000,
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; agentId: string }) =>
      apiDelete(`/api/memories/${id}`),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.memories(agentId) });
    },
  });
}

export function useClearMemories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      apiDelete(`/api/agents/${agentId}/memories`),
    onSuccess: (_, agentId) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.memories(agentId) });
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
