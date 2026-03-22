import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PromptTemplate, CreateTemplateInput } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
};

export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.lists(),
    queryFn: () => apiGet<PromptTemplate[]>('/api/templates'),
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      apiPost<PromptTemplate>('/api/templates', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateTemplateInput> & { id: string }) =>
      apiPatch<PromptTemplate>(`/api/templates/${id}`, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.setQueryData(templateKeys.detail(data.id), data);
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}
