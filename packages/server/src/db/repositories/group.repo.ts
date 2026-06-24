import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { PermissionGroup, UserRole } from '@subagent/shared';

interface GroupRow {
  id: string;
  name: string;
  role: string;
  project_ids: string;
  created_at: string;
}

function rowToGroup(row: GroupRow): PermissionGroup {
  let projectIds: string[] = [];
  try { projectIds = JSON.parse(row.project_ids ?? '[]') as string[]; } catch { projectIds = []; }
  return { id: row.id, name: row.name, role: row.role as UserRole, projectIds, createdAt: row.created_at };
}

export const groupRepo = {
  async list(): Promise<PermissionGroup[]> {
    return (await getDb().prepare('SELECT * FROM permission_groups ORDER BY created_at ASC').all<GroupRow>()).map(rowToGroup);
  },

  async findByIds(ids: string[]): Promise<PermissionGroup[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return (await getDb().prepare(`SELECT * FROM permission_groups WHERE id IN (${placeholders})`).all<GroupRow>(...ids)).map(rowToGroup);
  },

  /** Union of projects accessible via the given group ids. */
  async projectIdsFor(groupIds: string[]): Promise<string[]> {
    const set = new Set<string>();
    for (const g of await this.findByIds(groupIds)) for (const p of g.projectIds) set.add(p);
    return [...set];
  },

  async create(input: { name: string; role?: UserRole; projectIds?: string[] }): Promise<PermissionGroup> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO permission_groups (id, name, role, project_ids, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, input.name, input.role ?? 'contributor', JSON.stringify(input.projectIds ?? []), now);
    return rowToGroup((await db.prepare('SELECT * FROM permission_groups WHERE id = ?').get<GroupRow>(id))!);
  },

  async update(id: string, fields: { name?: string; role?: UserRole; projectIds?: string[] }): Promise<PermissionGroup | undefined> {
    const db = getDb();
    const cur = await db.prepare('SELECT * FROM permission_groups WHERE id = ?').get<GroupRow>(id);
    if (!cur) return undefined;
    await db.prepare('UPDATE permission_groups SET name = ?, role = ?, project_ids = ? WHERE id = ?').run(
      fields.name ?? cur.name,
      fields.role ?? cur.role,
      fields.projectIds ? JSON.stringify(fields.projectIds) : cur.project_ids,
      id,
    );
    return rowToGroup((await db.prepare('SELECT * FROM permission_groups WHERE id = ?').get<GroupRow>(id))!);
  },

  async remove(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM permission_groups WHERE id = ?').run(id)).changes > 0;
  },
};
