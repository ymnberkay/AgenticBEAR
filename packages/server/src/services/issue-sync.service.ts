/**
 * Open an internal issue in an external tracker (GitHub Issues / Jira / Azure Boards).
 * Best-effort: returns null on any failure (never throws) so issue creation still succeeds.
 */
import type { Issue, IssueKind } from '@subagent/shared';
import type { ConnectionWithToken } from '../db/repositories/integration.repo.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('issue-sync');

export interface ExternalRef { externalId: string; externalUrl: string }

const TIMEOUT_MS = 15_000;
const fetchJson = async (url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; text: string }> => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, data, text };
};

const trim = (s: string) => s.replace(/\/+$/, '');

function jiraIssueType(kind: IssueKind): string {
  if (kind === 'bug' || kind === 'vulnerability') return 'Bug';
  return 'Task';
}
function azureWorkItemType(kind: IssueKind): string {
  if (kind === 'bug' || kind === 'vulnerability') return 'Bug';
  return 'Issue';
}

/** Merge the issue's own labels with the auto-derived kind/priority tags, deduped. */
function combinedTags(issue: Issue): string[] {
  const all = [...issue.labels, issue.kind, issue.priority];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of all) {
    const v = (t ?? '').toString().trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Best-effort one-line summary of a failed upstream response (Azure/GitHub/Jira). */
function shortHttpReason(provider: string, status: number, text: string, data: any): string {
  // Try common JSON shapes for a useful message before falling back to the raw body.
  const fromData =
    data?.message ||
    data?.error?.message ||
    data?.errors?.[0]?.message ||
    (data?.errorMessages && Array.isArray(data.errorMessages) ? data.errorMessages[0] : undefined) ||
    null;
  const snippet = (fromData ?? text ?? '').toString().replace(/\s+/g, ' ').slice(0, 180);
  return `${provider} ${status}: ${snippet || '(empty response)'}`;
}

async function syncGithub(conn: ConnectionWithToken, issue: Issue): Promise<ExternalRef | null> {
  const owner = conn.config.owner;
  const repo = conn.config.repo;
  if (!owner || !repo || !conn.token) { const m = 'github sync: missing owner/repo/token'; log.warn(m); throw new Error(m); }
  const base = trim(conn.baseUrl || 'https://api.github.com');
  const r = await fetchJson(`${base}/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'AgenticBEAR' },
    body: JSON.stringify({ title: issue.title, body: issue.description, labels: combinedTags(issue) }),
  });
  if (!r.ok) {
    const reason = shortHttpReason('github', r.status, r.text, r.data);
    log.warn(`github sync failed: ${reason}`);
    throw new Error(reason);
  }
  return { externalId: String(r.data.number), externalUrl: r.data.html_url };
}

async function syncJira(conn: ConnectionWithToken, issue: Issue): Promise<ExternalRef | null> {
  const projectKey = conn.config.projectKey;
  const email = conn.config.email;
  if (!projectKey || !email || !conn.token || !conn.baseUrl) { const m = 'jira sync: missing projectKey/email/token/baseUrl'; log.warn(m); throw new Error(m); }
  const base = trim(conn.baseUrl);
  const auth = Buffer.from(`${email}:${conn.token}`).toString('base64');
  const r = await fetchJson(`${base}/rest/api/2/issue`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: issue.title,
        description: issue.description || issue.title,
        issuetype: { name: jiraIssueType(issue.kind) },
        labels: issue.labels,
      },
    }),
  });
  if (!r.ok) {
    const reason = shortHttpReason('jira', r.status, r.text, r.data);
    log.warn(`jira sync failed: ${reason}`);
    throw new Error(reason);
  }
  return { externalId: r.data.key, externalUrl: `${base}/browse/${r.data.key}` };
}

async function syncAzure(conn: ConnectionWithToken, issue: Issue): Promise<ExternalRef | null> {
  const project = conn.config.project;
  if (!project || !conn.token || !conn.baseUrl) { const m = 'azure sync: missing project/token/baseUrl'; log.warn(m); throw new Error(m); }
  const base = trim(conn.baseUrl); // e.g. https://dev.azure.com/{org}
  const type = azureWorkItemType(issue.kind);
  const auth = Buffer.from(`:${conn.token}`).toString('base64');
  const url = `${base}/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.0`;
  // Azure tags are a single semicolon-separated string in System.Tags.
  const tags = combinedTags(issue).join('; ');
  const body: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: issue.title },
    { op: 'add', path: '/fields/System.Description', value: issue.description || issue.title },
  ];
  if (tags) body.push({ op: 'add', path: '/fields/System.Tags', value: tags });
  const r = await fetchJson(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const reason = shortHttpReason('azure', r.status, r.text, r.data);
    log.warn(`azure sync failed: ${reason}`);
    throw new Error(reason);
  }
  const href = r.data?._links?.html?.href ?? `${base}/${project}/_workitems/edit/${r.data?.id}`;
  return { externalId: String(r.data?.id ?? ''), externalUrl: href };
}

/** Open `issue` in the connection's external tracker. Returns the external ref, or null on failure. */
export async function syncIssueToTracker(conn: ConnectionWithToken, issue: Issue): Promise<ExternalRef | null> {
  const r = await syncIssueToTrackerVerbose(conn, issue);
  return r.ref;
}

/** Same as `syncIssueToTracker` but also returns the upstream failure reason for the UI. */
export async function syncIssueToTrackerVerbose(conn: ConnectionWithToken, issue: Issue): Promise<{ ref: ExternalRef | null; error?: string }> {
  try {
    let ref: ExternalRef | null = null;
    if (conn.kind === 'github') ref = await syncGithub(conn, issue);
    else if (conn.kind === 'jira') ref = await syncJira(conn, issue);
    else if (conn.kind === 'azure_devops') ref = await syncAzure(conn, issue);
    else return { ref: null, error: `Unsupported tracker kind: ${conn.kind}` };
    if (ref) return { ref };
    return { ref: null, error: 'Tracker rejected the request (provider config / token / payload). Check the server log.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`issue sync to ${conn.kind} errored`, err);
    return { ref: null, error: msg };
  }
}
