export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Run {
  id: string;
  projectId: string;
  objective: string;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  /** Cost-layer olmasaydı toplam maliyet — savings = totalBaselineCostUsd - totalCostUsd. */
  totalBaselineCostUsd: number;
  createdAt: string;
}

export interface CreateRunInput {
  projectId: string;
  objective: string;
}
