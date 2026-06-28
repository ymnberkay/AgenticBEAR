export type TaskStatus =
  | 'queued'
  | 'delegated'
  | 'in_progress'
  | 'awaiting_handoff'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface Task {
  id: string;
  runId: string;
  parentTaskId: string | null;
  assignedAgentId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  dependencies: string[];
  order: number;
  output: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RunStep {
  id: string;
  runId: string;
  taskId: string;
  agentId: string;
  type: 'api_call' | 'file_read' | 'file_write' | 'handoff' | 'reasoning' | 'error';
  input: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Cost-layer olmasaydı maliyet — savings = baselineCostUsd - costUsd. */
  baselineCostUsd: number;
  durationMs: number;
  /** Served model (router sonrası) — per-model kırılım için. */
  model?: string | null;
  providerId?: string | null;
  cacheHit?: boolean;
  routerTier?: string | null;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** L0 compression ile kazanılan input token. */
  compressionSavedTokens?: number;
  createdAt: string;
}

export interface FileChange {
  id: string;
  runStepId: string;
  runId: string;
  filePath: string;
  operation: 'create' | 'modify' | 'delete';
  previousContent: string | null;
  newContent: string;
  agentId: string;
  /**
   * 'applied' — written to disk (agentic runs auto-apply; default).
   * 'pending' — proposed in chat, awaiting user approval (not yet on disk).
   * 'rejected' — user declined.
   */
  status: 'applied' | 'pending' | 'rejected';
  appliedAt: string | null;
  createdAt: string;
}
