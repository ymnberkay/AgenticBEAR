import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  IntegrationConnection, CreateIntegrationConnectionInput, UpdateIntegrationConnectionInput, ProjectIntegration,
} from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

const connKey = ['integrations'] as const;
const projKey = (projectId: string) => ['project-integrations', projectId] as const;

// ── Org connections ──
export function useConnections() {
  return useQuery({ queryKey: connKey, queryFn: () => apiGet<IntegrationConnection[]>('/api/integrations'), retry: false });
}
export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIntegrationConnectionInput) => apiPost<IntegrationConnection>('/api/integrations', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: connKey }),
  });
}
export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateIntegrationConnectionInput) => apiPatch<IntegrationConnection>(`/api/integrations/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: connKey }),
  });
}
export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/integrations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: connKey }),
  });
}

// ── Project links ──
export function useProjectIntegrations(projectId: string) {
  return useQuery({ queryKey: projKey(projectId), queryFn: () => apiGet<ProjectIntegration[]>(`/api/projects/${projectId}/integrations`), enabled: !!projectId });
}
export function useLinkIntegration(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { connectionId: string; syncEnabled?: boolean }) => apiPost<ProjectIntegration>(`/api/projects/${projectId}/integrations`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: projKey(projectId) }),
  });
}
export function useSetIntegrationSync(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, syncEnabled }: { id: string; syncEnabled: boolean }) => apiPatch(`/api/project-integrations/${id}`, { syncEnabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projKey(projectId) }),
  });
}
export function useUnlinkIntegration(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/project-integrations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projKey(projectId) }),
  });
}
