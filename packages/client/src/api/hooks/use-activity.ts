import { useQuery } from '@tanstack/react-query';
import type { ActivityLogEntry } from '@subagent/shared';
import { apiGet } from '../client';

export interface ActivityFilters {
  action?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ActivityPaginatedResult {
  entries: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

function buildQuery(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.search) params.set('search', filters.search);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.pageSize && filters.pageSize !== 25) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Per-project audit trail with optional filters & server-side pagination. */
export function useProjectActivity(projectId: string, filters: ActivityFilters = {}) {
  const hasFilters = !!(filters.action || filters.userId || filters.search || filters.from || filters.to || (filters.page && filters.page > 1));

  return useQuery({
    queryKey: ['activity', projectId, filters],
    queryFn: async () => {
      const qs = buildQuery(filters);
      const data = await apiGet<ActivityLogEntry[] | ActivityPaginatedResult>(
        `/api/projects/${projectId}/activity${qs}`,
      );
      // Normalize: if filters are active, the server returns paginated; otherwise a plain array
      if (hasFilters && data && typeof (data as ActivityPaginatedResult).total === 'number') {
        return data as ActivityPaginatedResult;
      }
      const entries = Array.isArray(data) ? data : (data as ActivityPaginatedResult).entries ?? [];
      return { entries, total: entries.length, page: 1, pageSize: entries.length } satisfies ActivityPaginatedResult;
    },
    enabled: !!projectId,
    refetchInterval: 20_000,
  });
}

/** List distinct users for the activity filter dropdown. */
export function useActivityUsers(projectId: string) {
  return useQuery({
    queryKey: ['activity', projectId, 'users'],
    queryFn: () => apiGet<{ userId: string; username: string }[]>(`/api/projects/${projectId}/activity/users`),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}
