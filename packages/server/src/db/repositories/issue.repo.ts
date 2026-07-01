/** Per-project issues (filed by users or agents; optionally synced to an external tracker). */
import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { Issue, IssueKind, IssueStatus, IssuePriority, CreateIssueInput } from '@subagent/shared';

interface Row {
  id: string; project_id: string; title: string; description: string; kind: string; status: string;
  priority: string; source: string; agent_id: string | null; run_id: string | null;
  connection_id: string | null; external_id: string | null; external_url: string | null;
  labels_json: string | null;
  created_at: string; updated_at: string;
}

function parseLabels(json: string | null | undefined): string[] {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
/** Trim, lowercase-compare-deduped, capped at 20 entries — keeps labels tidy across sources. */
function normalizeLabels(raw: readonly string[] | undefined | null): string[] {
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
    if (out.length >= 20) break;
  }
  return out;
}

function toIssue(r: Row): Issue {
  return {
    id: r.id, projectId: r.project_id, title: r.title, description: r.description,
    kind: r.kind as IssueKind, status: r.status as IssueStatus, priority: r.priority as IssuePriority,
    labels: parseLabels(r.labels_json),
    source: r.source, agentId: r.agent_id, runId: r.run_id, connectionId: r.connection_id,
    externalId: r.external_id, externalUrl: r.external_url, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export const issueRepo = {
  async listByProject(projectId: string): Promise<Issue[]> {
    const rows = await getDb().prepare('SELECT * FROM issues WHERE project_id = ? ORDER BY created_at DESC').all<Row>(projectId);
    return rows.map(toIssue);
  },

  async findById(id: string): Promise<Issue | undefined> {
    const row = await getDb().prepare('SELECT * FROM issues WHERE id = ?').get<Row>(id);
    return row ? toIssue(row) : undefined;
  },

  async create(projectId: string, input: CreateIssueInput): Promise<Issue> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    const status: IssueStatus = (input as { status?: IssueStatus }).status ?? 'open';
    await db.prepare(`
      INSERT INTO issues (id, project_id, title, description, kind, status, priority, source, agent_id, run_id, labels_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, input.title, input.description ?? '', input.kind ?? 'issue',
      status, input.priority ?? 'medium', input.source ?? 'user', input.agentId ?? null, input.runId ?? null,
      JSON.stringify(normalizeLabels(input.labels)), now, now,
    );
    return (await this.findById(id))!;
  },

  async update(id: string, patch: Partial<{ status: IssueStatus; priority: IssuePriority; title: string; description: string; labels: string[] }>): Promise<Issue | undefined> {
    const db = getDb();
    const cur = await this.findById(id);
    if (!cur) return undefined;
    const labelsJson = patch.labels !== undefined ? JSON.stringify(normalizeLabels(patch.labels)) : JSON.stringify(cur.labels);
    await db.prepare('UPDATE issues SET title = ?, description = ?, status = ?, priority = ?, labels_json = ?, updated_at = ? WHERE id = ?')
      .run(patch.title ?? cur.title, patch.description ?? cur.description, patch.status ?? cur.status, patch.priority ?? cur.priority, labelsJson, new Date().toISOString(), id);
    return this.findById(id);
  },

  /** Record the external tracker result after a successful sync. */
  async setExternal(id: string, connectionId: string, externalId: string, externalUrl: string): Promise<void> {
    await getDb().prepare('UPDATE issues SET connection_id = ?, external_id = ?, external_url = ?, updated_at = ? WHERE id = ?')
      .run(connectionId, externalId, externalUrl, new Date().toISOString(), id);
  },

  async findByExternal(connectionId: string, externalId: string): Promise<Issue | undefined> {
    const row = await getDb().prepare('SELECT * FROM issues WHERE connection_id = ? AND external_id = ? LIMIT 1').get<Row>(connectionId, externalId);
    return row ? toIssue(row) : undefined;
  },

  /** Upsert an issue from an external tracker (used by the inbound pull). */
  async upsertFromExternal(
    projectId: string,
    connectionId: string,
    externalId: string,
    externalUrl: string,
    patch: { title: string; description: string; kind: IssueKind; status: IssueStatus; priority: IssuePriority; labels: string[] },
  ): Promise<{ issue: Issue; created: boolean }> {
    const existing = await this.findByExternal(connectionId, externalId);
    if (existing) {
      const db = getDb();
      await db.prepare(`UPDATE issues SET title = ?, description = ?, kind = ?, status = ?, priority = ?, labels_json = ?, external_url = ?, updated_at = ? WHERE id = ?`)
        .run(patch.title, patch.description, patch.kind, patch.status, patch.priority, JSON.stringify(normalizeLabels(patch.labels)), externalUrl, new Date().toISOString(), existing.id);
      return { issue: (await this.findById(existing.id))!, created: false };
    }
    const id = generateId();
    const now = new Date().toISOString();
    await getDb().prepare(`
      INSERT INTO issues (id, project_id, title, description, kind, status, priority, source, agent_id, run_id, connection_id, external_id, external_url, labels_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'external', NULL, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      id, projectId, patch.title, patch.description, patch.kind, patch.status, patch.priority,
      connectionId, externalId, externalUrl, JSON.stringify(normalizeLabels(patch.labels)), now, now,
    );
    return { issue: (await this.findById(id))!, created: true };
  },

  async remove(id: string): Promise<boolean> {
    return (await getDb().prepare('DELETE FROM issues WHERE id = ?').run(id)).changes > 0;
  },
};
