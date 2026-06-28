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
  total_baseline_cost_usd: number;
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
    totalBaselineCostUsd: row.total_baseline_cost_usd,
    createdAt: row.created_at,
  };
}

/** Who initiated a run — stored for the usage-by-user dashboard + quota attribution. */
export interface RunAttribution {
  userId?: string | null;
  username?: string | null;
  groupId?: string | null;
}

export interface UpdateRunInput {
  status?: RunStatus;
  startedAt?: string;
  completedAt?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCostUsd?: number;
  totalBaselineCostUsd?: number;
}

export const runRepo = {
  async findByProjectId(projectId: string): Promise<Run[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC')
      .all<RunRow>(projectId);
    return rows.map(rowToRun);
  },

  async findById(id: string): Promise<Run | undefined> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM runs WHERE id = ?').get<RunRow>(id);
    return row ? rowToRun(row) : undefined;
  },

  /** Who initiated the run + which group it counts against (for quota recording on completion). */
  async getAttribution(id: string): Promise<RunAttribution> {
    const db = getDb();
    const row = await db.prepare('SELECT user_id, username, group_id FROM runs WHERE id = ?')
      .get<{ user_id: string | null; username: string | null; group_id: string | null }>(id);
    return { userId: row?.user_id ?? null, username: row?.username ?? null, groupId: row?.group_id ?? null };
  },

  async create(input: CreateRunInput, attribution?: RunAttribution): Promise<Run> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO runs (id, project_id, objective, status, created_at, user_id, username, group_id)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(
      id, input.projectId, input.objective, now,
      attribution?.userId ?? null, attribution?.username ?? null, attribution?.groupId ?? null,
    );

    return (await this.findById(id))!;
  },

  async update(id: string, input: UpdateRunInput): Promise<Run | undefined> {
    const db = getDb();
    const existing = await this.findById(id);
    if (!existing) return undefined;

    const status = input.status ?? existing.status;
    const startedAt = input.startedAt ?? existing.startedAt;
    const completedAt = input.completedAt ?? existing.completedAt;
    const totalInputTokens = input.totalInputTokens ?? existing.totalInputTokens;
    const totalOutputTokens = input.totalOutputTokens ?? existing.totalOutputTokens;
    const totalCostUsd = input.totalCostUsd ?? existing.totalCostUsd;
    const totalBaselineCostUsd = input.totalBaselineCostUsd ?? existing.totalBaselineCostUsd;

    await db.prepare(`
      UPDATE runs SET status = ?, started_at = ?, completed_at = ?, total_input_tokens = ?, total_output_tokens = ?, total_cost_usd = ?, total_baseline_cost_usd = ?
      WHERE id = ?
    `).run(status, startedAt, completedAt, totalInputTokens, totalOutputTokens, totalCostUsd, totalBaselineCostUsd, id);

    return (await this.findById(id))!;
  },
};
