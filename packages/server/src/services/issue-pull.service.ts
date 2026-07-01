/**
 * Inbound sync: pull external tracker work items into the local Issues table.
 *
 * Today only Azure Boards is implemented (the explicit ask). GitHub/Jira return a no-op result
 * so the polling scheduler doesn't error on those connections. Pull is best-effort: any error is
 * captured in the result rather than thrown, so the periodic scheduler keeps running.
 *
 * Mapping (Azure → local):
 *   System.State            → status   (New → open; Active/Approved/Committed/Doing → in_progress; Resolved/Closed/Done → closed)
 *   Microsoft.VSTS.Common.Priority (1-4) → priority (1=critical, 2=high, 3=medium, 4=low)
 *   System.WorkItemType     → kind     (Bug→bug; Issue/Task→that; otherwise issue)
 *   System.Tags             → labels   (semicolon-separated)
 */
import type { IssueKind, IssueStatus, IssuePriority, IssuePullResult } from '@subagent/shared';
import type { ConnectionWithToken } from '../db/repositories/integration.repo.js';
import { integrationRepo } from '../db/repositories/integration.repo.js';
import { issueRepo } from '../db/repositories/issue.repo.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('issue-pull');

const TIMEOUT_MS = 20_000;
const fetchJson = async (url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; text: string }> => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, data, text };
};
const trim = (s: string) => s.replace(/\/+$/, '');

function azureStateToStatus(state: string | undefined): IssueStatus {
  const s = (state ?? '').toLowerCase();
  if (!s || s === 'new' || s === 'proposed' || s === 'to do' || s === 'todo' || s === 'open') return 'open';
  if (s === 'resolved' || s === 'closed' || s === 'done' || s === 'removed') return 'closed';
  return 'in_progress';
}
function azurePriorityToLocal(n: number | undefined): IssuePriority {
  if (!Number.isFinite(n as number)) return 'medium';
  const v = n as number;
  if (v <= 1) return 'critical';
  if (v === 2) return 'high';
  if (v === 3) return 'medium';
  return 'low';
}
function azureTypeToKind(t: string | undefined): IssueKind {
  const v = (t ?? '').toLowerCase();
  if (v === 'bug') return 'bug';
  if (v === 'task') return 'task';
  if (v === 'issue') return 'issue';
  if (v.includes('vuln')) return 'vulnerability';
  if (v === 'feature' || v === 'epic' || v === 'user story' || v === 'product backlog item') return 'improvement';
  return 'issue';
}
function parseAzureTags(tags: string | undefined): string[] {
  if (!tags) return [];
  // Azure stores tags as "a; b; c" (sometimes commas). Split on either.
  return tags.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}
/** Crude HTML→text — Azure System.Description is HTML; we keep visible text only. */
function stripHtml(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EMPTY = (): IssuePullResult => ({ imported: 0, updated: 0, skipped: 0, errors: [], syncedAt: new Date().toISOString() });

async function pullAzure(projectId: string, conn: ConnectionWithToken, since: string | null): Promise<IssuePullResult> {
  const res = EMPTY();
  const project = conn.config.project;
  if (!project || !conn.token || !conn.baseUrl) { res.errors.push('missing project/token/baseUrl'); return res; }
  const base = trim(conn.baseUrl);
  const auth = Buffer.from(`:${conn.token}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' };

  // 1) WIQL: list ids that changed since the watermark (or recent 7d on first run).
  const wiqlUrl = `${base}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.0`;
  const sinceClause = since
    ? `[System.ChangedDate] >= '${since.slice(0, 19).replace('T', ' ')}'`
    : `[System.ChangedDate] >= @Today - 7`;
  const wiqlBody = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${project.replace(/'/g, "''")}' AND ${sinceClause} ORDER BY [System.ChangedDate] ASC`,
  };
  const wiql = await fetchJson(wiqlUrl, { method: 'POST', headers, body: JSON.stringify(wiqlBody) });
  if (!wiql.ok) {
    res.errors.push(`wiql ${wiql.status}: ${wiql.text.slice(0, 160)}`);
    return res;
  }
  const ids: number[] = (wiql.data?.workItems ?? []).map((w: { id: number }) => w.id).filter((n: number) => Number.isFinite(n));
  if (ids.length === 0) return res;

  // 2) Batch fetch the work items (200 ids per call max for the /workitems endpoint).
  const FIELDS = ['System.Id', 'System.Title', 'System.Description', 'System.State', 'System.WorkItemType', 'System.Tags', 'Microsoft.VSTS.Common.Priority'];
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const url = `${base}/_apis/wit/workitems?ids=${slice.join(',')}&fields=${FIELDS.join(',')}&api-version=7.0`;
    const r = await fetchJson(url, { method: 'GET', headers });
    if (!r.ok) { res.errors.push(`batch ${r.status}: ${r.text.slice(0, 160)}`); continue; }
    const items: Array<{ id: number; fields?: Record<string, unknown>; _links?: { html?: { href?: string } } }> = r.data?.value ?? [];
    for (const it of items) {
      const f = it.fields ?? {};
      const externalId = String(it.id);
      const title = (f['System.Title'] as string) || `Work item ${externalId}`;
      const description = stripHtml(f['System.Description'] as string);
      const status = azureStateToStatus(f['System.State'] as string);
      const priority = azurePriorityToLocal(f['Microsoft.VSTS.Common.Priority'] as number);
      const kind = azureTypeToKind(f['System.WorkItemType'] as string);
      const labels = parseAzureTags(f['System.Tags'] as string);
      const href = it._links?.html?.href ?? `${base}/${project}/_workitems/edit/${externalId}`;
      try {
        const out = await issueRepo.upsertFromExternal(projectId, conn.id, externalId, href, { title, description, kind, status, priority, labels });
        if (out.created) res.imported += 1; else res.updated += 1;
      } catch (err) {
        res.errors.push(`upsert ${externalId}: ${err instanceof Error ? err.message : String(err)}`);
        res.skipped += 1;
      }
    }
  }
  return res;
}

/**
 * Pull from the given linked connection. Returns counts + watermark; also persists the new
 * `last_pull_at` watermark on the project_integrations row so the next call resumes from there.
 */
export async function pullProjectIssues(projectId: string, connectionId?: string): Promise<IssuePullResult> {
  const link = await integrationRepo.findProjectIntegration(projectId, connectionId);
  if (!link) {
    return { ...EMPTY(), errors: ['No linked tracker for this project'] };
  }
  const conn = link.conn;
  const since = await integrationRepo.getLastPullAt(link.id);
  let result: IssuePullResult;
  try {
    if (conn.kind === 'azure_devops') result = await pullAzure(projectId, conn, since);
    else result = { ...EMPTY(), errors: [`Inbound pull not implemented for ${conn.kind}`] };
  } catch (err) {
    log.warn(`pull from ${conn.kind} errored`, err);
    result = { ...EMPTY(), errors: [err instanceof Error ? err.message : String(err)] };
  }
  // Advance the watermark only on success (no errors means everything since `since` was processed).
  if (result.errors.length === 0) {
    await integrationRepo.setLastPullAt(link.id, result.syncedAt);
  }
  return result;
}

/** Iterate every active project link and pull. Errors per link are logged, never thrown. */
export async function pullAllProjectIssues(): Promise<{ pulled: number; imported: number; updated: number }> {
  const links = await integrationRepo.listActiveProjectLinks();
  let imported = 0, updated = 0;
  for (const l of links) {
    try {
      const r = await pullProjectIssues(l.projectId, l.conn.id);
      imported += r.imported;
      updated += r.updated;
      if (r.errors.length) log.warn(`pull for project ${l.projectId} ended with ${r.errors.length} errors`, r.errors);
    } catch (err) {
      log.warn(`pull for project ${l.projectId} threw`, err);
    }
  }
  return { pulled: links.length, imported, updated };
}
