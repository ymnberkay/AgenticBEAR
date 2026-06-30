/**
 * Per-project audit trail — "who did what, when". Append-only; best-effort writes
 * (a failed log must never break the underlying action).
 */
import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { ActivityLogEntry } from '@subagent/shared';

interface Row {
  id: string;
  project_id: string | null;
  user_id: string | null;
  username: string;
  action: string;
  target: string;
  detail: string;
  created_at: string;
}

function toEntry(r: Row): ActivityLogEntry {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    username: r.username,
    action: r.action,
    target: r.target,
    detail: r.detail,
    createdAt: r.created_at,
  };
}

export interface RecordActivityInput {
  projectId?: string | null;
  userId?: string | null;
  username?: string;
  action: string;
  target?: string;
  detail?: string;
}

export interface ActivityFilterParams {
  projectId: string;
  action?: string;
  userId?: string;
  search?: string;
  from?: string; // ISO date string
  to?: string;   // ISO date string
  page?: number;
  pageSize?: number;
}

export interface ActivityPaginatedResult {
  entries: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export const activityLogRepo = {
  async record(input: RecordActivityInput): Promise<void> {
    const db = getDb();
    await db.prepare(`
      INSERT INTO activity_log (id, project_id, user_id, username, action, target, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      input.projectId ?? null,
      input.userId ?? null,
      input.username ?? '',
      input.action,
      input.target ?? '',
      input.detail ?? '',
      new Date().toISOString(),
    );
  },

  async listByProject(projectId: string, limit = 100): Promise<ActivityLogEntry[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
      .all<Row>(projectId, limit);
    return rows.map(toEntry);
  },

  /** Filtered, paginated listing for the Activity Log UI. */
  async listFiltered(params: ActivityFilterParams): Promise<ActivityPaginatedResult> {
    const db = getDb();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));

    const conditions: string[] = ['project_id = ?'];
    const values: (string | number)[] = [params.projectId];

    if (params.action) {
      conditions.push('action = ?');
      values.push(params.action);
    }
    if (params.userId) {
      conditions.push('user_id = ?');
      values.push(params.userId);
    }
    if (params.search) {
      // Search across target, detail, and username
      conditions.push('(target LIKE ? OR detail LIKE ? OR username LIKE ?)');
      const q = `%${params.search}%`;
      values.push(q, q, q);
    }
    if (params.from) {
      conditions.push('created_at >= ?');
      values.push(params.from);
    }
    if (params.to) {
      conditions.push('created_at <= ?');
      values.push(params.to);
    }

    const where = conditions.join(' AND ');

    // Count total
    const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM activity_log WHERE ${where}`)
      .get<{ cnt: number }>(...values);
    const total = countRow?.cnt ?? 0;

    // Fetch page
    const offset = (page - 1) * pageSize;
    const rows = await db.prepare(
      `SELECT * FROM activity_log WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all<Row>(...values, pageSize, offset);

    return {
      entries: rows.map(toEntry),
      total,
      page,
      pageSize,
    };
  },

  /** Get distinct users who have activity in a project (for filter dropdown). */
  async listUsers(projectId: string): Promise<{ userId: string; username: string }[]> {
    const db = getDb();
    const rows = await db.prepare(
      `SELECT DISTINCT user_id, username FROM activity_log WHERE project_id = ? AND user_id IS NOT NULL ORDER BY username ASC`
    ).all<{ user_id: string; username: string }>(projectId);
    return rows.map(r => ({ userId: r.user_id, username: r.username }));
  },
};
