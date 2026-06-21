import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateGatewayKeyInput, GatewayKey, GatewayKeyCreated, GatewayUsageSummary } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

const keyKeys = { all: ['gateway-keys'] as const };
const usageKeys = { all: ['gateway-usage'] as const };

export interface CatalogModel {
  id: string;
  object: 'model';
  owned_by: string;
}

export function useGatewayKeys() {
  return useQuery({
    queryKey: keyKeys.all,
    queryFn: () => apiGet<GatewayKey[]>('/api/gateway-keys'),
  });
}

export function useCreateGatewayKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGatewayKeyInput) => apiPost<GatewayKeyCreated>('/api/gateway-keys', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keyKeys.all }),
  });
}

export function useSetGatewayKeyEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPatch<GatewayKey>(`/api/gateway-keys/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keyKeys.all }),
  });
}

export function useDeleteGatewayKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/gateway-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keyKeys.all }),
  });
}

export interface GatewayUsageFilter {
  range?: string;
  keyId?: string;
  model?: string;
}

export function useGatewayUsage(filter: GatewayUsageFilter = {}) {
  const qs = new URLSearchParams();
  if (filter.range) qs.set('range', filter.range);
  if (filter.keyId) qs.set('keyId', filter.keyId);
  if (filter.model) qs.set('model', filter.model);
  const q = qs.toString();
  return useQuery({
    queryKey: [...usageKeys.all, filter],
    queryFn: () => apiGet<GatewayUsageSummary>(`/api/gateway-usage${q ? `?${q}` : ''}`),
    refetchInterval: 15_000,
  });
}

const catalogKey = ['model-catalog'] as const;

export function useModelCatalog() {
  return useQuery({
    queryKey: catalogKey,
    queryFn: async () => (await apiGet<{ data: CatalogModel[] }>('/api/models')).data,
  });
}

/** Force a live re-discovery (bypasses the server-side 5-min cache) and updates the catalog. */
export function useRefreshModelCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiGet<{ data: CatalogModel[] }>('/api/models?refresh=1')).data,
    onSuccess: (data) => qc.setQueryData(catalogKey, data),
  });
}
