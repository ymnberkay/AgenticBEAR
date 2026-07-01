/**
 * External tracker connections (org-level) + per-project links. Tokens are stored in `token`
 * and never returned (masked via `hasCredentials`). Built on the async DB adapter.
 */
import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type {
  IntegrationConnection, IntegrationKind, CreateIntegrationConnectionInput,
  UpdateIntegrationConnectionInput, ProjectIntegration,
} from '@subagent/shared';

interface ConnRow {
  id: string; kind: string; label: string; base_url: string; config_json: string;
  token: string; enabled: number; labels_vocabulary_json: string | null;
  created_at: string; updated_at: string;
}
interface ProjIntRow {
  id: string; project_id: string; connection_id: string; sync_enabled: number; created_at: string;
  last_pull_at?: string | null;
}

function parseConfig(json: string | null): Record<string, string> {
  try { const v = JSON.parse(json ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function parseLabelsVocab(json: string | null | undefined): string[] {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function normalizeVocab(raw: readonly string[] | undefined | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = (r ?? '').toString().trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 50) break;
  }
  return out;
}

/** Public (masked) shape — never leaks the token. */
function rowToConn(r: ConnRow): IntegrationConnection {
  return {
    id: r.id, kind: r.kind as IntegrationKind, label: r.label, baseUrl: r.base_url,
    config: parseConfig(r.config_json), enabled: r.enabled === 1, hasCredentials: !!r.token,
    labelsVocabulary: parseLabelsVocab(r.labels_vocabulary_json),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** Internal — includes the token, for server-side sync calls only. */
export interface ConnectionWithToken extends IntegrationConnection { token: string }
function rowToConnWithToken(r: ConnRow): ConnectionWithToken {
  return { ...rowToConn(r), token: r.token };
}

function rowToProjInt(r: ProjIntRow, kind: IntegrationKind): ProjectIntegration {
  return { id: r.id, projectId: r.project_id, connectionId: r.connection_id, kind, syncEnabled: r.sync_enabled === 1, createdAt: r.created_at };
}

export const integrationRepo = {
  async listConnections(): Promise<IntegrationConnection[]> {
    const rows = await getDb().prepare('SELECT * FROM integration_connections ORDER BY created_at ASC').all<ConnRow>();
    return rows.map(rowToConn);
  },

  /** Internal: connection incl. token (for sync). */
  async getConnectionWithToken(id: string): Promise<ConnectionWithToken | undefined> {
    const row = await getDb().prepare('SELECT * FROM integration_connections WHERE id = ?').get<ConnRow>(id);
    return row ? rowToConnWithToken(row) : undefined;
  },

  async createConnection(input: CreateIntegrationConnectionInput): Promise<IntegrationConnection> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO integration_connections (id, kind, label, base_url, config_json, token, enabled, labels_vocabulary_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.kind, input.label ?? '', input.baseUrl ?? '', JSON.stringify(input.config ?? {}),
      input.token ?? '', input.enabled === false ? 0 : 1,
      JSON.stringify(normalizeVocab(input.labelsVocabulary)), now, now,
    );
    return rowToConn((await db.prepare('SELECT * FROM integration_connections WHERE id = ?').get<ConnRow>(id))!);
  },

  async updateConnection(id: string, input: UpdateIntegrationConnectionInput): Promise<IntegrationConnection | undefined> {
    const db = getDb();
    const cur = await db.prepare('SELECT * FROM integration_connections WHERE id = ?').get<ConnRow>(id);
    if (!cur) return undefined;
    const now = new Date().toISOString();
    await db.prepare(`
      UPDATE integration_connections SET label = ?, base_url = ?, config_json = ?, token = ?, enabled = ?, labels_vocabulary_json = ?, updated_at = ? WHERE id = ?
    `).run(
      input.label ?? cur.label,
      input.baseUrl ?? cur.base_url,
      input.config ? JSON.stringify(input.config) : cur.config_json,
      input.token !== undefined ? input.token : cur.token, // omit token to keep existing; '' clears
      input.enabled !== undefined ? (input.enabled ? 1 : 0) : cur.enabled,
      input.labelsVocabulary !== undefined ? JSON.stringify(normalizeVocab(input.labelsVocabulary)) : cur.labels_vocabulary_json ?? '[]',
      now, id,
    );
    return rowToConn((await db.prepare('SELECT * FROM integration_connections WHERE id = ?').get<ConnRow>(id))!);
  },

  async removeConnection(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM integration_connections WHERE id = ?').run(id)).changes > 0;
  },

  // ── Project links ──
  async listProjectIntegrations(projectId: string): Promise<ProjectIntegration[]> {
    const rows = await getDb().prepare(`
      SELECT pi.*, ic.kind AS conn_kind FROM project_integrations pi
      JOIN integration_connections ic ON ic.id = pi.connection_id
      WHERE pi.project_id = ? ORDER BY pi.created_at ASC
    `).all<ProjIntRow & { conn_kind: string }>(projectId);
    return rows.map((r) => rowToProjInt(r, r.conn_kind as IntegrationKind));
  },

  /** The first enabled, sync-enabled connection for a project (used when filing an issue). */
  async activeSyncConnection(projectId: string): Promise<ConnectionWithToken | undefined> {
    const row = await getDb().prepare(`
      SELECT ic.* FROM project_integrations pi
      JOIN integration_connections ic ON ic.id = pi.connection_id
      WHERE pi.project_id = ? AND pi.sync_enabled = 1 AND ic.enabled = 1
      ORDER BY pi.created_at ASC LIMIT 1
    `).get<ConnRow>(projectId);
    return row ? rowToConnWithToken(row) : undefined;
  },

  async linkProject(projectId: string, connectionId: string, syncEnabled = true): Promise<ProjectIntegration> {
    const db = getDb();
    const id = generateId();
    await db.prepare('INSERT INTO project_integrations (id, project_id, connection_id, sync_enabled, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, projectId, connectionId, syncEnabled ? 1 : 0, new Date().toISOString());
    return (await this.listProjectIntegrations(projectId)).find((p) => p.id === id)!;
  },

  async setProjectSync(id: string, syncEnabled: boolean): Promise<void> {
    await getDb().prepare('UPDATE project_integrations SET sync_enabled = ? WHERE id = ?').run(syncEnabled ? 1 : 0, id);
  },

  async unlinkProject(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM project_integrations WHERE id = ?').run(id)).changes > 0;
  },

  /** Stored "last successful inbound pull" — used as the WIQL `[ChangedDate] >=` watermark. */
  async getLastPullAt(projectIntegrationId: string): Promise<string | null> {
    const row = await getDb().prepare('SELECT last_pull_at FROM project_integrations WHERE id = ?').get<{ last_pull_at: string | null }>(projectIntegrationId);
    const v = row?.last_pull_at ?? '';
    return v && v.length > 0 ? v : null;
  },
  async setLastPullAt(projectIntegrationId: string, iso: string): Promise<void> {
    await getDb().prepare('UPDATE project_integrations SET last_pull_at = ? WHERE id = ?').run(iso, projectIntegrationId);
  },

  /** All projects that have an enabled, sync-on connection — used by the polling scheduler. */
  async listActiveProjectLinks(): Promise<Array<{ projectIntegrationId: string; projectId: string; conn: ConnectionWithToken }>> {
    const rows = await getDb().prepare(`
      SELECT pi.id AS pi_id, pi.project_id AS p_id, ic.*
      FROM project_integrations pi
      JOIN integration_connections ic ON ic.id = pi.connection_id
      WHERE pi.sync_enabled = 1 AND ic.enabled = 1
    `).all<ConnRow & { pi_id: string; p_id: string }>();
    return rows.map((r) => ({ projectIntegrationId: r.pi_id, projectId: r.p_id, conn: rowToConnWithToken(r) }));
  },

  /** Resolve the project_integrations row id for a given project + connection (or the first if connectionId omitted). */
  async findProjectIntegration(projectId: string, connectionId?: string): Promise<{ id: string; conn: ConnectionWithToken } | undefined> {
    const where = connectionId ? 'pi.project_id = ? AND pi.connection_id = ?' : 'pi.project_id = ?';
    const args = connectionId ? [projectId, connectionId] : [projectId];
    const row = await getDb().prepare(`
      SELECT pi.id AS pi_id, ic.*
      FROM project_integrations pi
      JOIN integration_connections ic ON ic.id = pi.connection_id
      WHERE ${where}
      ORDER BY pi.created_at ASC LIMIT 1
    `).get<ConnRow & { pi_id: string }>(...args);
    return row ? { id: row.pi_id, conn: rowToConnWithToken(row) } : undefined;
  },
};
