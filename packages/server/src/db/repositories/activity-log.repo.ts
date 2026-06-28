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
};
