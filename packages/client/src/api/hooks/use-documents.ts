import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectDocumentInput, ProjectDocument } from '@subagent/shared';
import { apiGet, apiPost, apiDelete } from '../client';

const docKeys = {
  list: (projectId: string) => ['documents', projectId] as const,
};

export function useDocuments(projectId: string) {
  return useQuery({
    queryKey: docKeys.list(projectId),
    queryFn: () => apiGet<ProjectDocument[]>(`/api/projects/${projectId}/documents`),
    enabled: !!projectId,
  });
}

export function useCreateDocument(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectDocumentInput) =>
      apiPost<ProjectDocument>(`/api/projects/${projectId}/documents`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.list(projectId) }),
  });
}

export function useDeleteDocument(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.list(projectId) }),
  });
}
