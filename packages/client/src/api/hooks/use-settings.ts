import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Settings, UpdateSettingsInput } from '@subagent/shared';
import { apiGet, apiPatch } from '../client';

const settingsKeys = {
  all: ['settings'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => apiGet<Settings>('/api/settings'),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) =>
      apiPatch<Settings>('/api/settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.all, data);
    },
  });
}
