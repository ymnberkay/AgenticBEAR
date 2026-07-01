/**
 * SonarQube findings puller.
 *
 * v1 is read-only: we fetch issues from an already-scanned SonarQube project via the public API
 * and file them as local `Issue` records via `createProjectIssue`. Each SonarQube issue is
 * dedupelabelled with `sonarqube:<sq-issue-key>`, and we skip anything we've already imported.
 *
 * We deliberately do NOT trigger a scan here — running `sonar-scanner` is a CI concern and
 * should stay off the server. If you want a scan-then-read flow, chain this after a shell
 * command that runs the scanner from a project workspace.
 */
import type { Issue, IssueKind, IssuePriority } from '@subagent/shared';
import { integrationRepo } from '../db/repositories/integration.repo.js';
import { issueRepo } from '../db/repositories/issue.repo.js';
import { createProjectIssue } from './issue.service.js';
import { projectRepo } from '../db/repositories/project.repo.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sonarqube-scan');

interface SonarQubeIssue {
  key: string;
  rule: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  component: string;
  project: string;
  line?: number;
  hash?: string;
  status: 'OPEN' | 'CONFIRMED' | 'REOPENED' | 'RESOLVED' | 'CLOSED';
  message: string;
  effort?: string;
  debt?: string;
  author?: string;
  tags: string[];
  creationDate: string;
  updateDate: string;
  type: 'CODE_SMELL' | 'BUG' | 'VULNERABILITY' | 'SECURITY_HOTSPOT';
}

interface SonarQubeSearchResponse {
  total: number;
  p: number;
  ps: number;
  paging: { pageIndex: number; pageSize: number; total: number };
  issues: SonarQubeIssue[];
}

/** SonarQube severity → our internal priority. */
function toPriority(sev: SonarQubeIssue['severity']): IssuePriority {
  if (sev === 'BLOCKER' || sev === 'CRITICAL') return 'critical';
  if (sev === 'MAJOR') return 'high';
  if (sev === 'MINOR') return 'medium';
  return 'low';
}

/** SonarQube issue type → our internal kind. Hotspots go into `vulnerability`. */
function toKind(t: SonarQubeIssue['type']): IssueKind {
  if (t === 'BUG') return 'bug';
  if (t === 'VULNERABILITY' || t === 'SECURITY_HOTSPOT') return 'vulnerability';
  if (t === 'CODE_SMELL') return 'improvement';
  return 'issue';
}

const trim = (s: string) => s.replace(/\/+$/, '');

interface FetchOptions {
  /** Filter to specific severities (default: all). */
  severities?: SonarQubeIssue['severity'][];
  /** Only issues changed since (ISO date). Empty → no filter. */
  since?: string;
  /** Hard cap on how many issues to import in one call (default 200). */
  limit?: number;
}

/** Try to parse a SonarQube error response into a human sentence. */
function sqErrorReason(status: number, text: string): string {
  try {
    const j = JSON.parse(text) as { errors?: Array<{ msg?: string }> };
    if (j.errors && j.errors[0]?.msg) return `sonarqube ${status}: ${j.errors[0].msg}`;
  } catch { /* fall through */ }
  return `sonarqube ${status}: ${text.slice(0, 200) || '(empty response)'}`;
}

export interface ScanFindingsResult {
  imported: number;
  skipped: number;
  errors: string[];
  imports: Array<{ id: string; title: string; severity: string; type: string; externalUrl: string | null }>;
}

/**
 * Fetch issues from SonarQube for a project's configured SQ project key, and file each one that
 * isn't already imported.
 *
 * The caller (agent tool handler) is expected to have already verified the project has both a
 * SonarQube integration + a sonarqubeProjectKey set — this function double-checks anyway.
 */
export async function scanSonarQubeFindings(projectId: string, opts: FetchOptions = {}): Promise<ScanFindingsResult> {
  const result: ScanFindingsResult = { imported: 0, skipped: 0, errors: [], imports: [] };
  const project = await projectRepo.findById(projectId);
  if (!project) { result.errors.push('Project not found'); return result; }
  if (!project.sonarqubeProjectKey.trim()) {
    result.errors.push('No SonarQube project key configured for this project. Set it under Project → Settings.');
    return result;
  }

  // Find the linked SonarQube connection for this project. We accept either an explicit
  // project_integrations link OR any org-level SonarQube connection (single-tenant orgs are common).
  const links = await integrationRepo.listProjectIntegrations(projectId);
  let connectionId = links.find((l) => l.kind === 'sonarqube')?.connectionId;
  if (!connectionId) {
    const allConns = await integrationRepo.listConnections();
    const sq = allConns.find((c) => c.kind === 'sonarqube' && c.enabled && c.hasCredentials);
    if (sq) connectionId = sq.id;
  }
  if (!connectionId) {
    result.errors.push('No SonarQube integration is configured. Add one under Settings → Integrations.');
    return result;
  }
  const conn = await integrationRepo.getConnectionWithToken(connectionId);
  if (!conn) { result.errors.push('SonarQube connection could not be loaded.'); return result; }
  if (!conn.token) { result.errors.push('SonarQube integration has no token stored.'); return result; }

  const base = trim(conn.baseUrl || 'https://sonarcloud.io');
  const authHeader = `Bearer ${conn.token}`; // SonarQube accepts token via Bearer OR user:token@ basic; Bearer is cleaner.

  const limit = Math.min(200, Math.max(1, opts.limit ?? 200));
  const pageSize = 100;
  const pages = Math.ceil(limit / pageSize);
  const existing = await issueRepo.listByProject(projectId);
  const alreadyImported = new Set<string>();
  for (const it of existing) {
    for (const l of it.labels) {
      if (l.startsWith('sonarqube:')) alreadyImported.add(l.slice('sonarqube:'.length));
    }
  }

  const params = (page: number): string => {
    const q = new URLSearchParams();
    q.set('componentKeys', project.sonarqubeProjectKey);
    q.set('resolved', 'false');
    q.set('ps', String(pageSize));
    q.set('p', String(page));
    if (opts.severities && opts.severities.length > 0) q.set('severities', opts.severities.join(','));
    if (opts.since) q.set('createdAfter', opts.since);
    return q.toString();
  };

  const fetched: SonarQubeIssue[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `${base}/api/issues/search?${params(page)}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      result.errors.push(`network error: ${err instanceof Error ? err.message : String(err)}`);
      return result;
    }
    const text = await res.text();
    if (!res.ok) {
      result.errors.push(sqErrorReason(res.status, text));
      return result;
    }
    let data: SonarQubeSearchResponse;
    try { data = JSON.parse(text) as SonarQubeSearchResponse; }
    catch { result.errors.push('sonarqube returned non-JSON response'); return result; }
    fetched.push(...data.issues);
    if (data.issues.length < pageSize) break;
    if (fetched.length >= limit) break;
  }

  for (const sq of fetched.slice(0, limit)) {
    if (alreadyImported.has(sq.key)) { result.skipped += 1; continue; }
    const url = `${base}/project/issues?id=${encodeURIComponent(sq.project)}&issues=${encodeURIComponent(sq.key)}&open=${encodeURIComponent(sq.key)}`;
    const component = sq.component.split(':').pop() ?? sq.component;
    const location = sq.line ? `${component}:${sq.line}` : component;
    const description = [
      sq.message,
      '',
      `**Rule:** ${sq.rule}`,
      `**Severity:** ${sq.severity}`,
      `**Type:** ${sq.type}`,
      `**Location:** \`${location}\``,
      sq.effort ? `**Effort:** ${sq.effort}` : '',
      `**Sonar URL:** ${url}`,
    ].filter(Boolean).join('\n');

    const labels = [`sonarqube:${sq.key}`, ...(sq.tags ?? [])];
    let issue: Issue;
    try {
      issue = await createProjectIssue(projectId, {
        title: sq.message.length > 200 ? sq.message.slice(0, 197) + '…' : sq.message,
        description,
        kind: toKind(sq.type),
        priority: toPriority(sq.severity),
        labels,
        source: 'agent',
      });
    } catch (err) {
      result.errors.push(`Failed to file "${sq.message.slice(0, 60)}": ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    result.imported += 1;
    result.imports.push({ id: issue.id, title: issue.title, severity: sq.severity, type: sq.type, externalUrl: issue.externalUrl });
  }

  if (result.imported === 0 && result.skipped > 0 && result.errors.length === 0) {
    log.info(`sonarqube: 0 new (skipped ${result.skipped} already-imported) for project ${projectId}`);
  } else {
    log.info(`sonarqube: imported ${result.imported}, skipped ${result.skipped}, errors ${result.errors.length} for project ${projectId}`);
  }
  return result;
}
