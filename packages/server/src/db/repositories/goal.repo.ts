/** Per-project goals (filed by users or agents; Excel/CSV imports also land here). */
import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type {
  ProjectGoal, CreateGoalInput, UpdateGoalInput, GoalStatus, GoalPriority, GoalSource,
} from '@subagent/shared';

interface Row {
  id: string; project_id: string; title: string; description: string;
  status: string; priority: string; order_index: number; source: string;
  due_date: string | null;
  created_at: string; updated_at: string;
}

function toGoal(r: Row): ProjectGoal {
  return {
    id: r.id, projectId: r.project_id, title: r.title, description: r.description,
    status: r.status as GoalStatus, priority: r.priority as GoalPriority,
    orderIndex: r.order_index, source: r.source as GoalSource,
    dueDate: r.due_date, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export const goalRepo = {
  /** Returns goals sorted by order_index ASC, falling back to created_at for stability. */
  async listByProject(projectId: string): Promise<ProjectGoal[]> {
    const rows = await getDb()
      .prepare('SELECT * FROM project_goals WHERE project_id = ? ORDER BY order_index ASC, created_at ASC')
      .all<Row>(projectId);
    return rows.map(toGoal);
  },

  async findById(id: string): Promise<ProjectGoal | undefined> {
    const row = await getDb().prepare('SELECT * FROM project_goals WHERE id = ?').get<Row>(id);
    return row ? toGoal(row) : undefined;
  },

  /** Next order_index: pushes new goals to the bottom of the list by default. */
  async nextOrderIndex(projectId: string): Promise<number> {
    const row = await getDb()
      .prepare('SELECT COALESCE(MAX(order_index), -1) AS mx FROM project_goals WHERE project_id = ?')
      .get<{ mx: number }>(projectId);
    return (row?.mx ?? -1) + 1;
  },

  async create(projectId: string, input: CreateGoalInput): Promise<ProjectGoal> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    const orderIndex = await this.nextOrderIndex(projectId);
    await db.prepare(`
      INSERT INTO project_goals (id, project_id, title, description, status, priority, order_index, source, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, input.title, input.description ?? '',
      input.status ?? 'pending', input.priority ?? 'medium',
      orderIndex, input.source ?? 'user', input.dueDate ?? null, now, now,
    );
    return (await this.findById(id))!;
  },

  /** Bulk insert (Excel/CSV import). Inserts in input order; first row goes to the bottom. */
  async bulkCreate(projectId: string, inputs: CreateGoalInput[]): Promise<ProjectGoal[]> {
    if (inputs.length === 0) return [];
    const db = getDb();
    const startIndex = await this.nextOrderIndex(projectId);
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const id = generateId();
      ids.push(id);
      const input = inputs[i]!;
      await db.prepare(`
        INSERT INTO project_goals (id, project_id, title, description, status, priority, order_index, source, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, projectId, input.title, input.description ?? '',
        input.status ?? 'pending', input.priority ?? 'medium',
        startIndex + i, input.source ?? 'excel', input.dueDate ?? null, now, now,
      );
    }
    const inserted = await Promise.all(ids.map((id) => this.findById(id)));
    return inserted.filter((g): g is ProjectGoal => !!g);
  },

  async update(id: string, patch: UpdateGoalInput): Promise<ProjectGoal | undefined> {
    const db = getDb();
    const cur = await this.findById(id);
    if (!cur) return undefined;
    await db.prepare(`
      UPDATE project_goals SET title = ?, description = ?, status = ?, priority = ?, order_index = ?, due_date = ?, updated_at = ? WHERE id = ?
    `).run(
      patch.title ?? cur.title,
      patch.description ?? cur.description,
      patch.status ?? cur.status,
      patch.priority ?? cur.priority,
      patch.orderIndex ?? cur.orderIndex,
      patch.dueDate !== undefined ? patch.dueDate : cur.dueDate,
      new Date().toISOString(),
      id,
    );
    return this.findById(id);
  },

  /** Persist a full re-ordering. Each entry maps a goal id to its new order_index. */
  async reorder(projectId: string, order: Array<{ id: string; orderIndex: number }>): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    for (const o of order) {
      await db.prepare('UPDATE project_goals SET order_index = ?, updated_at = ? WHERE id = ? AND project_id = ?')
        .run(o.orderIndex, now, o.id, projectId);
    }
  },

  async remove(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM project_goals WHERE id = ?').run(id)).changes > 0;
  },
};
