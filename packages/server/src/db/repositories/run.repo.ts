import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { Run, CreateRunInput, RunStatus } from '@subagent/shared';

interface RunRow {
  id: string;
  project_id: string;
  objective: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  created_at: string;
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    projectId: row.project_id,
    objective: row.objective,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCostUsd: row.total_cost_usd,
    createdAt: row.created_at,
  };
}

export interface UpdateRunInput {
  status?: RunStatus;
  startedAt?: string;
  completedAt?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCostUsd?: number;
}

export const runRepo = {
  findByProjectId(projectId: string): Run[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as RunRow[];
    return rows.map(rowToRun);
  },

  findById(id: string): Run | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
    return row ? rowToRun(row) : undefined;
  },

  create(input: CreateRunInput): Run {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO runs (id, project_id, objective, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(id, input.projectId, input.objective, now);

    return this.findById(id)!;
  },

  update(id: string, input: UpdateRunInput): Run | undefined {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const status = input.status ?? existing.status;
    const startedAt = input.startedAt ?? existing.startedAt;
    const completedAt = input.completedAt ?? existing.completedAt;
    const totalInputTokens = input.totalInputTokens ?? existing.totalInputTokens;
    const totalOutputTokens = input.totalOutputTokens ?? existing.totalOutputTokens;
    const totalCostUsd = input.totalCostUsd ?? existing.totalCostUsd;

    db.prepare(`
      UPDATE runs SET status = ?, started_at = ?, completed_at = ?, total_input_tokens = ?, total_output_tokens = ?, total_cost_usd = ?
      WHERE id = ?
    `).run(status, startedAt, completedAt, totalInputTokens, totalOutputTokens, totalCostUsd, id);

    return this.findById(id)!;
  },
};
