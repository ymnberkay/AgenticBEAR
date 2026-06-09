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
}

export function useProjectAnalytics(projectId: string) {
  return useQuery({
    queryKey: ['analytics', projectId],
    queryFn: () => apiGet<ProjectAnalytics>(`/api/projects/${projectId}/analytics`),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });
}
