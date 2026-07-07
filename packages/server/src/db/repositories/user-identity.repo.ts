import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { SsoProviderId } from '@subagent/shared';

interface IdentityRow {
  id: string;
  user_id: string;
  provider: string;
  subject: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface UserIdentity {
  id: string;
  userId: string;
  provider: SsoProviderId;
  subject: string;
  email: string;
  displayName: string;
  createdAt: string;
}

function rowToIdentity(row: IdentityRow): UserIdentity {
  return {
    id: row.id, userId: row.user_id, provider: row.provider as SsoProviderId,
    subject: row.subject, email: row.email, displayName: row.display_name, createdAt: row.created_at,
  };
}

export const userIdentityRepo = {
  async findByProviderSubject(provider: SsoProviderId, subject: string): Promise<UserIdentity | undefined> {
    const row = await getDb().prepare('SELECT * FROM user_identities WHERE provider = ? AND subject = ?').get<IdentityRow>(provider, subject);
    return row ? rowToIdentity(row) : undefined;
  },

  async listByUser(userId: string): Promise<UserIdentity[]> {
    return (await getDb().prepare('SELECT * FROM user_identities WHERE user_id = ? ORDER BY created_at ASC').all<IdentityRow>(userId)).map(rowToIdentity);
  },

  /** provider → [userId] for every linked account (users list decorates rows with this). */
  async providersByUser(): Promise<Record<string, SsoProviderId[]>> {
    const rows = await getDb().prepare('SELECT user_id, provider FROM user_identities').all<{ user_id: string; provider: string }>();
    const map: Record<string, SsoProviderId[]> = {};
    for (const r of rows) (map[r.user_id] ??= []).push(r.provider as SsoProviderId);
    return map;
  },

  async link(input: { userId: string; provider: SsoProviderId; subject: string; email?: string; displayName?: string }): Promise<UserIdentity> {
    const db = getDb();
    const id = generateId();
    await db.prepare(`
      INSERT INTO user_identities (id, user_id, provider, subject, email, display_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.userId, input.provider, input.subject, input.email ?? '', input.displayName ?? '', new Date().toISOString());
    return rowToIdentity((await db.prepare('SELECT * FROM user_identities WHERE id = ?').get<IdentityRow>(id))!);
  },

  /** Refresh claims we mirror locally (email/name drift at the IdP). */
  async touch(id: string, fields: { email?: string; displayName?: string }): Promise<void> {
    const db = getDb();
    if (fields.email !== undefined) await db.prepare('UPDATE user_identities SET email = ? WHERE id = ?').run(fields.email, id);
    if (fields.displayName !== undefined) await db.prepare('UPDATE user_identities SET display_name = ? WHERE id = ?').run(fields.displayName, id);
  },

  async removeForUser(userId: string): Promise<void> {
    await getDb().prepare('DELETE FROM user_identities WHERE user_id = ?').run(userId);
  },
};
