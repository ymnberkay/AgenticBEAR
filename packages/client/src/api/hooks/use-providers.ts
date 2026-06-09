import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateProviderInput, LLMProvider, UpdateProviderInput } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

/** Provider as returned by the API (apiKey is masked, hasApiKey added). */
export type ProviderView = LLMProvider & { hasApiKey: boolean };

const providerKeys = {
  all: ['providers'] as const,
};

export function useProviders() {
  return useQuery({
    queryKey: providerKeys.all,
    queryFn: () => apiGet<ProviderView[]>('/api/providers'),
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProviderInput) => apiPost<ProviderView>('/api/providers', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProviderInput }) =>
      apiPatch<ProviderView>(`/api/providers/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: providerKeys.all }),
  });
}
