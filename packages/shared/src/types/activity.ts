export type ActivityStatus = 'running' | 'completed' | 'failed';

export interface AgentActivity {
  id: string;
  projectId: string;
  agentId: string;
  type: 'mcp_call' | 'direct';
  query: string;
  status: ActivityStatus;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

// ── Audit log (per-project Activity tab) ──────────────────────────────────────

export type ActivityAction =
  | 'chat.message'
  | 'file.apply'
  | 'file.reject'
  | 'agent.create'
  | 'agent.update'
  | 'agent.delete'
  | 'run.start'
  | 'run.complete';

/** A discrete "who did what, when" audit entry. */
export interface ActivityLogEntry {
  id: string;
  /** null for org-level actions (no specific project). */
  projectId: string | null;
  userId: string | null;
  username: string;
  action: ActivityAction | string;
  /** What was acted on — a file path, agent name, run objective, etc. */
  target: string;
  /** Optional extra context (free text / small JSON). */
  detail: string;
  createdAt: string;
}

// ── Usage attribution (admin usage-by-user / by-group dashboard) ───────────────

/** One row of the usage-by-user / by-group dashboard. */
export interface UsageByPrincipal {
  /** Stable key — username (app), `key:<name>` (gateway), or group id. */
  key: string;
  label: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Only set for the by-group view. null = unlimited. */
  quota?: number | null;
}
