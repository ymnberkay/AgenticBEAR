import { getDb } from '../client.js';
import { generateId, ALL_CAPABILITIES } from '@subagent/shared';
import type { Capability, CustomRole } from '@subagent/shared';

interface RoleRow {
  id: string;
  name: string;
  description: string;
  capabilities: string;
  created_at: string;
}

/** Keep only known capability keys (guards against stale keys after a catalog change). */
function parseCaps(raw: string): Capability[] {
  try {
    const arr = JSON.parse(raw ?? '[]') as string[];
    return arr.filter((c): c is Capability => (ALL_CAPABILITIES as string[]).includes(c));
  } catch {
    return [];
  }
}

function rowToRole(row: RoleRow): CustomRole {
  return { id: row.id, name: row.name, description: row.description ?? '', capabilities: parseCaps(row.capabilities), createdAt: row.created_at };
}

export const roleRepo = {
  async list(): Promise<CustomRole[]> {
    return (await getDb().prepare('SELECT * FROM custom_roles ORDER BY created_at ASC').all<RoleRow>()).map(rowToRole);
  },

  async findById(id: string): Promise<CustomRole | undefined> {
    const row = await getDb().prepare('SELECT * FROM custom_roles WHERE id = ?').get<RoleRow>(id);
    return row ? rowToRole(row) : undefined;
  },

  async create(input: { name: string; description?: string; capabilities: Capability[] }): Promise<CustomRole> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO custom_roles (id, name, description, capabilities, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, input.name, input.description ?? '', JSON.stringify(input.capabilities ?? []), now);
    return rowToRole((await db.prepare('SELECT * FROM custom_roles WHERE id = ?').get<RoleRow>(id))!);
  },

  async update(id: string, fields: { name?: string; description?: string; capabilities?: Capability[] }): Promise<CustomRole | undefined> {
    const db = getDb();
    const cur = await db.prepare('SELECT * FROM custom_roles WHERE id = ?').get<RoleRow>(id);
    if (!cur) return undefined;
    await db.prepare('UPDATE custom_roles SET name = ?, description = ?, capabilities = ? WHERE id = ?').run(
      fields.name ?? cur.name,
      fields.description !== undefined ? fields.description : cur.description,
      fields.capabilities ? JSON.stringify(fields.capabilities) : cur.capabilities,
      id,
    );
    return rowToRole((await db.prepare('SELECT * FROM custom_roles WHERE id = ?').get<RoleRow>(id))!);
  },

  async remove(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM custom_roles WHERE id = ?').run(id)).changes > 0;
  },
};
