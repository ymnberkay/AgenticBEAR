import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { GatewayKey, GatewayKeyCreated } from '@subagent/shared';

interface GatewayKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  allowed_models: string;
  enabled: number;
  created_at: string;
  expires_at: string | null;
  cache_scope: string | null;
  group_id: string | null;
  rate_limit_per_min: number | null;
  last_used_at: string | null;
}

function rowToKey(row: GatewayKeyRow): GatewayKey {
  let allowedModels: string[] = [];
  try {
    allowedModels = JSON.parse(row.allowed_models ?? '[]') as string[];
  } catch {
    allowedModels = [];
  }
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    allowedModels,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
    cacheScope: row.cache_scope === 'lastUser' ? 'lastUser' : 'conversation',
    groupId: row.group_id ?? null,
    rateLimitPerMin: row.rate_limit_per_min ?? null,
    lastUsedAt: row.last_used_at,
  };
}

export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export const gatewayKeyRepo = {
  /** Number of keys — when 0, the gateway runs open (bootstrap) until the first key exists. */
  async count(): Promise<number> {
    const db = getDb();
    const row = (await db.prepare('SELECT COUNT(*) AS n FROM gateway_keys').get<{ n: number }>())!;
    return row.n;
  },

  async create(input: { name?: string; allowedModels?: string[]; expiresAt?: string | null; cacheScope?: 'conversation' | 'lastUser'; groupId?: string | null; rateLimitPerMin?: number | null } = {}): Promise<GatewayKeyCreated> {
    const db = getDb();
    const id = generateId();
    // 32-hex secret.
    const rawKey = `agb_live_${randomBytes(16).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 16);
    const now = new Date().toISOString();
    const name = input.name ?? '';
    const allowedModels = input.allowedModels ?? [];
    const expiresAt = input.expiresAt ?? null;
    const cacheScope = input.cacheScope === 'lastUser' ? 'lastUser' : 'conversation';
    const groupId = input.groupId ?? null;
    const rateLimitPerMin = input.rateLimitPerMin && input.rateLimitPerMin > 0 ? Math.round(input.rateLimitPerMin) : null;
    await db.prepare(`
      INSERT INTO gateway_keys (id, name, key_prefix, key_hash, allowed_models, enabled, created_at, expires_at, cache_scope, group_id, rate_limit_per_min)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(id, name, keyPrefix, hashKey(rawKey), JSON.stringify(allowedModels), now, expiresAt, cacheScope, groupId, rateLimitPerMin);
    return { id, name, keyPrefix, allowedModels, enabled: true, createdAt: now, expiresAt, cacheScope, groupId, rateLimitPerMin, lastUsedAt: null, key: rawKey };
  },

  /**
   * Rotate a key's secret in place: same id/name/scope/limits, brand-new secret. The old secret
   * stops working immediately. Returns the key WITH its new full secret (shown once). Use when a
   * key is lost or suspected compromised — avoids re-wiring the key's group/scope config.
   */
  async regenerate(id: string): Promise<GatewayKeyCreated | undefined> {
    const db = getDb();
    const existing = await db.prepare('SELECT * FROM gateway_keys WHERE id = ?').get<GatewayKeyRow>(id);
    if (!existing) return undefined;
    const rawKey = `agb_live_${randomBytes(16).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 16);
    await db.prepare('UPDATE gateway_keys SET key_prefix = ?, key_hash = ?, last_used_at = NULL WHERE id = ?')
      .run(keyPrefix, hashKey(rawKey), id);
    const row = await db.prepare('SELECT * FROM gateway_keys WHERE id = ?').get<GatewayKeyRow>(id);
    return row ? { ...rowToKey(row), key: rawKey } : undefined;
  },

  async list(): Promise<GatewayKey[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM gateway_keys ORDER BY created_at DESC').all<GatewayKeyRow>();
    return rows.map(rowToKey);
  },

  async findByHash(keyHash: string): Promise<GatewayKey | undefined> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM gateway_keys WHERE key_hash = ?').get<GatewayKeyRow>(keyHash);
    return row ? rowToKey(row) : undefined;
  },

  async setEnabled(id: string, enabled: boolean): Promise<GatewayKey | undefined> {
    const db = getDb();
    await db.prepare('UPDATE gateway_keys SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    const row = await db.prepare('SELECT * FROM gateway_keys WHERE id = ?').get<GatewayKeyRow>(id);
    return row ? rowToKey(row) : undefined;
  },

  /** Flip an existing key's L1 cache scope (e.g. turn on FAQ mode without regenerating the key). */
  async setCacheScope(id: string, scope: 'conversation' | 'lastUser'): Promise<GatewayKey | undefined> {
    const db = getDb();
    await db.prepare('UPDATE gateway_keys SET cache_scope = ? WHERE id = ?').run(scope, id);
    const row = await db.prepare('SELECT * FROM gateway_keys WHERE id = ?').get<GatewayKeyRow>(id);
    return row ? rowToKey(row) : undefined;
  },

  /** Assign/clear the permission group a key counts against (quota + per-principal usage). */
  async setGroup(id: string, groupId: string | null): Promise<GatewayKey | undefined> {
    const db = getDb();
    await db.prepare('UPDATE gateway_keys SET group_id = ? WHERE id = ?').run(groupId, id);
    const row = await db.prepare('SELECT * FROM gateway_keys WHERE id = ?').get<GatewayKeyRow>(id);
    return row ? rowToKey(row) : undefined;
  },

  /** Set/clear the per-key rate limit (requests per minute). 0/null clears (unlimited). */
  async setLimits(id: string, limits: { rateLimitPerMin?: number | null }): Promise<GatewayKey | undefined> {
    const db = getDb();
    if (limits.rateLimitPerMin !== undefined) {
      const next = limits.rateLimitPerMin && limits.rateLimitPerMin > 0 ? Math.round(limits.rateLimitPerMin) : null;
      await db.prepare('UPDATE gateway_keys SET rate_limit_per_min = ? WHERE id = ?').run(next, id);
    }
    const row = await db.prepare('SELECT * FROM gateway_keys WHERE id = ?').get<GatewayKeyRow>(id);
    return row ? rowToKey(row) : undefined;
  },

  async touchLastUsed(id: string): Promise<void> {
    const db = getDb();
    await db.prepare('UPDATE gateway_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  },

  async remove(id: string): Promise<boolean> {
    const db = getDb();
    return (await db.prepare('DELETE FROM gateway_keys WHERE id = ?').run(id)).changes > 0;
  },
};
