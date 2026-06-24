import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { User, UserRole } from '@subagent/shared';
import { hashPassword } from '../../security/auth-service.js';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  role: string;
  group_ids: string;
  created_at: string;
}

/** Public shape (never leaks password_hash/salt). */
function rowToUser(row: UserRow): User {
  let groupIds: string[] = [];
  try { groupIds = JSON.parse(row.group_ids ?? '[]') as string[]; } catch { groupIds = []; }
  return { id: row.id, username: row.username, role: row.role as UserRole, groupIds, createdAt: row.created_at };
}

export const userRepo = {
  async count(): Promise<number> {
    return (await getDb().prepare('SELECT COUNT(*) AS n FROM users').get<{ n: number }>())!.n;
  },

  async list(): Promise<User[]> {
    return (await getDb().prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>()).map(rowToUser);
  },

  async findById(id: string): Promise<User | undefined> {
    const row = await getDb().prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(id);
    return row ? rowToUser(row) : undefined;
  },

  /** Full row incl. hash/salt — for password verification only. */
  async findRowByUsername(username: string): Promise<UserRow | undefined> {
    return getDb().prepare('SELECT * FROM users WHERE username = ?').get<UserRow>(username);
  },

  async create(input: { username: string; password: string; role?: UserRole; groupIds?: string[] }): Promise<User> {
    const db = getDb();
    const id = generateId();
    const { hash, salt } = hashPassword(input.password);
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, role, group_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.username, hash, salt, input.role ?? 'contributor', JSON.stringify(input.groupIds ?? []), now);
    return rowToUser((await db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(id))!);
  },

  async update(id: string, fields: { role?: UserRole; groupIds?: string[]; password?: string }): Promise<User | undefined> {
    const db = getDb();
    if (fields.role) await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(fields.role, id);
    if (fields.groupIds) await db.prepare('UPDATE users SET group_ids = ? WHERE id = ?').run(JSON.stringify(fields.groupIds), id);
    if (fields.password) {
      const { hash, salt } = hashPassword(fields.password);
      await db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, id);
    }
    return this.findById(id);
  },

  async remove(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM users WHERE id = ?').run(id)).changes > 0;
  },
};
