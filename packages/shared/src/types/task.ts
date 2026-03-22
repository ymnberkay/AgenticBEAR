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
  durationMs: number;
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
  createdAt: string;
}
