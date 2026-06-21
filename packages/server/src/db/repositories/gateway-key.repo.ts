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
    lastUsedAt: row.last_used_at,
  };
}

export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export const gatewayKeyRepo = {
  /** Number of keys — when 0, the gateway runs open (bootstrap) until the first key exists. */
  count(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) AS n FROM gateway_keys').get() as { n: number };
    return row.n;
  },

  create(input: { name?: string; allowedModels?: string[]; expiresAt?: string | null; cacheScope?: 'conversation' | 'lastUser' } = {}): GatewayKeyCreated {
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
    db.prepare(`
      INSERT INTO gateway_keys (id, name, key_prefix, key_hash, allowed_models, enabled, created_at, expires_at, cache_scope)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, name, keyPrefix, hashKey(rawKey), JSON.stringify(allowedModels), now, expiresAt, cacheScope);
    return { id, name, keyPrefix, allowedModels, enabled: true, createdAt: now, expiresAt, cacheScope, lastUsedAt: null, key: rawKey };
  },

  list(): GatewayKey[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM gateway_keys ORDER BY created_at DESC').all() as GatewayKeyRow[];
    return rows.map(rowToKey);
  },

  findByHash(keyHash: string): GatewayKey | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM gateway_keys WHERE key_hash = ?').get(keyHash) as GatewayKeyRow | undefined;
    return row ? rowToKey(row) : undefined;
  },

  setEnabled(id: string, enabled: boolean): GatewayKey | undefined {
    const db = getDb();
    db.prepare('UPDATE gateway_keys SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
    const row = db.prepare('SELECT * FROM gateway_keys WHERE id = ?').get(id) as GatewayKeyRow | undefined;
    return row ? rowToKey(row) : undefined;
  },

  touchLastUsed(id: string): void {
    const db = getDb();
    db.prepare('UPDATE gateway_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  },

  remove(id: string): boolean {
    const db = getDb();
    return db.prepare('DELETE FROM gateway_keys WHERE id = ?').run(id).changes > 0;
  },
};
