import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../client';

export interface AgentUsage {
  agentId: string;
  agentName: string;
  agentColor: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  savedUsd: number;
  runCount: number;
}

export interface DateUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  savedUsd: number;
}

export interface ModelUsage {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  savedUsd: number;
}

export interface RecentCall {
  model: string;
  agentName: string;
  agentColor: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  cacheHit: boolean;
  routerTier: string | null;
  createdAt: string;
}

export interface ProjectAnalytics {
  totalRuns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalBaselineCostUsd: number;
  totalSavedUsd: number;
  /** Tasarruf yüzdesi (0-100). */
  savedPct: number;
  byAgent: AgentUsage[];
  byDate: DateUsage[];
  /** Per-layer USD savings. `compression` (L0) = saved input tokens valued at the model's input price. */
  savingsByLayer: { compression: number; semanticCache: number; router: number; promptCache: number };
  cache: { hits: number; misses: number; total: number; hitRate: number };
  routerTiers: Record<string, number>;
  tokenMix: { input: number; output: number; cacheRead: number; cacheCreation: number };
  /** L0 context compression ile kazanılan input token. */
  compressionSavedTokens: number;
  byModel: ModelUsage[];
  recentCalls: RecentCall[];
}

export interface ProjectBreakdown {
  projectId: string;
  projectName: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  savedUsd: number;
  runCount: number;
}

/** Org-wide analytics across every project (project runs only), plus a per-project breakdown. */
export interface GlobalAnalytics extends ProjectAnalytics {
  byProject: ProjectBreakdown[];
}

export type AnalyticsRange = '1h' | '24h' | '7d' | '30d' | '90d' | 'all' | 'custom';

export interface AnalyticsFilter {
  range?: AnalyticsRange;
  /** ISO timestamps for custom range. */
  from?: string;
  to?: string;
}

/** Serialize an analytics filter into a query string (`?range=…` or custom `?from=…&to=…`). */
function analyticsQuery(filter: AnalyticsFilter): string {
  const qs = new URLSearchParams();
  if (filter.range === 'custom') {
    if (filter.from) qs.set('from', new Date(filter.from).toISOString());
    if (filter.to) qs.set('to', new Date(filter.to).toISOString());
  } else if (filter.range) {
    qs.set('range', filter.range);
  }
  const q = qs.toString();
  return q ? `?${q}` : '';
}

export function useProjectAnalytics(projectId: string, filter: AnalyticsFilter = {}) {
  return useQuery({
    queryKey: ['analytics', projectId, filter],
    queryFn: () => apiGet<ProjectAnalytics>(`/api/projects/${projectId}/analytics${analyticsQuery(filter)}`),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });
}

/** Org-wide analytics across all projects (for the Settings → Usage tab). */
export function useGlobalAnalytics(filter: AnalyticsFilter = {}) {
  return useQuery({
    queryKey: ['analytics', 'global', filter],
    queryFn: () => apiGet<GlobalAnalytics>(`/api/analytics${analyticsQuery(filter)}`),
    refetchInterval: 30_000,
  });
}
