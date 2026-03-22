import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { Task, TaskStatus, RunStep, FileChange } from '@subagent/shared';

// ─── Task Row Types ──────────────────────────────────────────────

interface TaskRow {
  id: string;
  run_id: string;
  parent_task_id: string | null;
  assigned_agent_id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  dependencies: string;
  order: number;
  output: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface RunStepRow {
  id: string;
  run_id: string;
  task_id: string;
  agent_id: string;
  type: string;
  input: string;
  output: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
}

interface FileChangeRow {
  id: string;
  run_step_id: string;
  run_id: string;
  file_path: string;
  operation: string;
  previous_content: string | null;
  new_content: string;
  agent_id: string;
  created_at: string;
}

// ─── Row Converters ──────────────────────────────────────────────

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    runId: row.run_id,
    parentTaskId: row.parent_task_id,
    assignedAgentId: row.assigned_agent_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority,
    dependencies: JSON.parse(row.dependencies) as string[],
    order: row.order,
    output: row.output,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function rowToRunStep(row: RunStepRow): RunStep {
  return {
    id: row.id,
    runId: row.run_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    type: row.type as RunStep['type'],
    input: row.input,
    output: row.output,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

function rowToFileChange(row: FileChangeRow): FileChange {
  return {
    id: row.id,
    runStepId: row.run_step_id,
    runId: row.run_id,
    filePath: row.file_path,
    operation: row.operation as FileChange['operation'],
    previousContent: row.previous_content,
    newContent: row.new_content,
    agentId: row.agent_id,
    createdAt: row.created_at,
  };
}

// ─── Create Input Types ──────────────────────────────────────────

export interface CreateTaskInput {
  runId: string;
  parentTaskId?: string | null;
  assignedAgentId: string;
  title: string;
  description: string;
  priority?: number;
  dependencies?: string[];
  order?: number;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  output?: string | null;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateRunStepInput {
  runId: string;
  taskId: string;
  agentId: string;
  type: RunStep['type'];
  input: string;
  output: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationMs?: number;
}

export interface CreateFileChangeInput {
  runStepId: string;
  runId: string;
  filePath: string;
  operation: FileChange['operation'];
  previousContent?: string | null;
  newContent: string;
  agentId: string;
}

// ─── Repository ──────────────────────────────────────────────────

export const taskRepo = {
  // ── Tasks ──────────────────────────────────────────────────────

  findByRunId(runId: string): Task[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY "order" ASC')
      .all(runId) as TaskRow[];
    return rows.map(rowToTask);
  },

  findById(id: string): Task | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : undefined;
  },

  createTask(input: CreateTaskInput): Task {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (id, run_id, parent_task_id, assigned_agent_id, title, description, status, priority, dependencies, "order", created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)
    `).run(
      id,
      input.runId,
      input.parentTaskId ?? null,
      input.assignedAgentId,
      input.title,
      input.description,
      input.priority ?? 0,
      JSON.stringify(input.dependencies ?? []),
      input.order ?? 0,
      now,
    );

    return this.findById(id)!;
  },

  updateTask(id: string, input: UpdateTaskInput): Task | undefined {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const status = input.status ?? existing.status;
    const output = input.output !== undefined ? input.output : existing.output;
    const startedAt = input.startedAt ?? existing.startedAt;
    const completedAt = input.completedAt ?? existing.completedAt;

    db.prepare(`
      UPDATE tasks SET status = ?, output = ?, started_at = ?, completed_at = ?
      WHERE id = ?
    `).run(status, output, startedAt, completedAt, id);

    return this.findById(id)!;
  },

  // ── Run Steps ──────────────────────────────────────────────────

  findStepsByRunId(runId: string): RunStep[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as RunStepRow[];
    return rows.map(rowToRunStep);
  },

  createStep(input: CreateRunStepInput): RunStep {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO run_steps (id, run_id, task_id, agent_id, type, input, output, input_tokens, output_tokens, cost_usd, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.runId,
      input.taskId,
      input.agentId,
      input.type,
      input.input,
      input.output,
      input.inputTokens ?? 0,
      input.outputTokens ?? 0,
      input.costUsd ?? 0,
      input.durationMs ?? 0,
      now,
    );

    const row = db.prepare('SELECT * FROM run_steps WHERE id = ?').get(id) as RunStepRow;
    return rowToRunStep(row);
  },

  // ── File Changes ───────────────────────────────────────────────

  findFileChangesByRunId(runId: string): FileChange[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM file_changes WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as FileChangeRow[];
    return rows.map(rowToFileChange);
  },

  createFileChange(input: CreateFileChangeInput): FileChange {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO file_changes (id, run_step_id, run_id, file_path, operation, previous_content, new_content, agent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.runStepId,
      input.runId,
      input.filePath,
      input.operation,
      input.previousContent ?? null,
      input.newContent,
      input.agentId,
      now,
    );

    const row = db.prepare('SELECT * FROM file_changes WHERE id = ?').get(id) as FileChangeRow;
    return rowToFileChange(row);
  },
};
