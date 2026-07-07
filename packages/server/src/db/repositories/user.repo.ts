import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { User, UserRole } from '@subagent/shared';
import { hashPassword } from '../../security/auth-service.js';
import { seal, openOrPlain } from '../../security/secret-box.js';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  role: string;
  group_ids: string;
  token_quota: number | null;
  email: string;
  totp_secret: string;
  totp_enabled: number;
  token_version: number;
  totp_last_counter: number;
  must_change_password: number;
  status: string;
  verify_token: string;
  created_at: string;
}

/** null / 0 / negative → null (unlimited); otherwise a positive integer. */
function normalizeQuota(v: number | null | undefined): number | null {
  if (v === undefined || v === null) return null;
  return v > 0 ? Math.round(v) : null;
}

/** Public shape (never leaks password_hash/salt/totp_secret). */
function rowToUser(row: UserRow): User {
  let groupIds: string[] = [];
  try { groupIds = JSON.parse(row.group_ids ?? '[]') as string[]; } catch { groupIds = []; }
  return {
    id: row.id, username: row.username, role: row.role as UserRole, groupIds,
    tokenQuota: row.token_quota ?? null,
    email: row.email ?? '', totpEnabled: !!row.totp_enabled,
    mustChangePassword: !!row.must_change_password,
    status: (row.status === 'pending' ? 'pending' : 'active'),
    createdAt: row.created_at,
  };
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

  /** Full row incl. totp_secret — for MFA verification only. */
  async findRowById(id: string): Promise<UserRow | undefined> {
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(id);
  },

  /** Session validation: public user + the token_version the token must carry. */
  async findForAuth(id: string): Promise<{ user: User; tokenVersion: number } | undefined> {
    const row = await this.findRowById(id);
    return row ? { user: rowToUser(row), tokenVersion: row.token_version ?? 0 } : undefined;
  },

  async create(input: { username: string; password: string; role?: UserRole; groupIds?: string[]; tokenQuota?: number | null; email?: string; mustChangePassword?: boolean; status?: 'active' | 'pending'; verifyToken?: string }): Promise<User> {
    const db = getDb();
    const id = generateId();
    const { hash, salt } = hashPassword(input.password);
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, role, group_ids, token_quota, email, must_change_password, status, verify_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.username, hash, salt, input.role ?? 'contributor', JSON.stringify(input.groupIds ?? []), normalizeQuota(input.tokenQuota), input.email ?? '', input.mustChangePassword ? 1 : 0, input.status ?? 'active', input.verifyToken ?? '', now);
    return rowToUser((await db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(id))!);
  },

  /** Look up a pending user by their verification token (single-use once activated). */
  async findRowByVerifyToken(token: string): Promise<UserRow | undefined> {
    if (!token) return undefined;
    return getDb().prepare("SELECT * FROM users WHERE verify_token = ? AND status = 'pending'").get<UserRow>(token);
  },

  /** Activate a pending user and clear the verification token. */
  async activate(id: string): Promise<void> {
    await getDb().prepare("UPDATE users SET status = 'active', verify_token = '' WHERE id = ?").run(id);
  },

  /** Store a pending TOTP secret (enabled=false) or flip it on once the first code verifies. */
  async setTotp(id: string, fields: { secret?: string; enabled?: boolean }): Promise<void> {
    const db = getDb();
    if (fields.secret !== undefined) {
      // Sealed at rest; reset the replay counter with every new secret.
      await db.prepare('UPDATE users SET totp_secret = ?, totp_last_counter = 0 WHERE id = ?')
        .run(fields.secret ? seal(fields.secret) : '', id);
    }
    if (fields.enabled !== undefined) await db.prepare('UPDATE users SET totp_enabled = ? WHERE id = ?').run(fields.enabled ? 1 : 0, id);
  },

  /** Decrypted TOTP secret off a full row ('' when none). */
  totpSecretOf(row: UserRow): string {
    return row.totp_secret ? openOrPlain(row.totp_secret) : '';
  },

  /**
   * Burn a TOTP counter: succeeds once per counter value (guards replay within the ±1 window,
   * atomically — safe across replicas and restarts).
   */
  async consumeTotpCounter(id: string, counter: number): Promise<boolean> {
    const res = await getDb().prepare('UPDATE users SET totp_last_counter = ? WHERE id = ? AND totp_last_counter < ?')
      .run(counter, id, counter);
    return res.changes > 0;
  },

  /** Invalidate every outstanding session token for this user ("log out everywhere"). */
  async bumpTokenVersion(id: string): Promise<number> {
    const db = getDb();
    await db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(id);
    return (await db.prepare('SELECT token_version FROM users WHERE id = ?').get<{ token_version: number }>(id))?.token_version ?? 0;
  },

  async setPassword(id: string, password: string, opts?: { mustChange?: boolean }): Promise<void> {
    const { hash, salt } = hashPassword(password);
    await getDb().prepare('UPDATE users SET password_hash = ?, salt = ?, must_change_password = ? WHERE id = ?')
      .run(hash, salt, opts?.mustChange ? 1 : 0, id);
  },

  async update(id: string, fields: { role?: UserRole; groupIds?: string[]; password?: string; tokenQuota?: number | null; mustChangePassword?: boolean }): Promise<User | undefined> {
    const db = getDb();
    if (fields.role) await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(fields.role, id);
    if (fields.groupIds) await db.prepare('UPDATE users SET group_ids = ? WHERE id = ?').run(JSON.stringify(fields.groupIds), id);
    if (fields.tokenQuota !== undefined) await db.prepare('UPDATE users SET token_quota = ? WHERE id = ?').run(normalizeQuota(fields.tokenQuota), id);
    if (fields.password) {
      await this.setPassword(id, fields.password, { mustChange: fields.mustChangePassword ?? false });
    }
    return this.findById(id);
  },

  async remove(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM users WHERE id = ?').run(id)).changes > 0;
  },
};
