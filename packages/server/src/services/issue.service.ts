/** Create a project issue and (best-effort) open it in the project's linked external tracker. */
import type { Issue, CreateIssueInput } from '@subagent/shared';
import { issueRepo } from '../db/repositories/issue.repo.js';
import { integrationRepo } from '../db/repositories/integration.repo.js';
import { syncIssueToTrackerVerbose } from './issue-sync.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('issue.service');

export async function createProjectIssue(projectId: string, input: CreateIssueInput): Promise<Issue> {
  const issue = await issueRepo.create(projectId, input);

  // If the project is linked to an enabled, sync-on tracker, open it there too.
  const conn = await integrationRepo.activeSyncConnection(projectId);
  if (conn) {
    const { ref, error } = await syncIssueToTrackerVerbose(conn, issue);
    if (ref) {
      await issueRepo.setExternal(issue.id, conn.id, ref.externalId, ref.externalUrl);
      return (await issueRepo.findById(issue.id))!;
    }
    if (error) log.warn(`outbound sync of issue ${issue.id} failed silently: ${error}`);
  }
  return issue;
}

export interface PushFailure {
  id: string;
  title: string;
  reason: string;
}
export interface PushUnsyncedResult {
  pushed: number;
  alreadySynced: number;
  failed: number;
  /** Per-failure detail so the UI can show "what didn't make it and why" and offer a retry. */
  failures: PushFailure[];
  /** Backwards-compat: flat error strings (deprecated; prefer `failures`). */
  errors: string[];
}

/**
 * Push local issues to the project's linked tracker.
 *
 * - `ids` undefined → push every unsynced issue in the project (the "backfill" case).
 * - `ids` provided  → push exactly those (the "retry the failed ones" case). Any id that's already
 *                     synced is silently counted in `alreadySynced` so callers can retry safely.
 *
 * Walks serially so we don't surprise the upstream API with parallel writes.
 */
export async function pushUnsyncedProjectIssues(projectId: string, ids?: string[]): Promise<PushUnsyncedResult> {
  const result: PushUnsyncedResult = { pushed: 0, alreadySynced: 0, failed: 0, failures: [], errors: [] };
  const conn = await integrationRepo.activeSyncConnection(projectId);
  if (!conn) {
    result.errors.push('No active sync-enabled tracker linked to this project');
    return result;
  }
  const all = await issueRepo.listByProject(projectId);
  const targetIds = ids && ids.length > 0 ? new Set(ids) : null;
  const candidates = targetIds ? all.filter((it) => targetIds.has(it.id)) : all;
  for (const issue of candidates) {
    // Issues that came from the tracker itself, or that were already pushed, stay put.
    if (issue.externalId || issue.connectionId === conn.id || issue.source === 'external') {
      result.alreadySynced += 1;
      continue;
    }
    const { ref, error } = await syncIssueToTrackerVerbose(conn, issue);
    if (ref) {
      await issueRepo.setExternal(issue.id, conn.id, ref.externalId, ref.externalUrl);
      result.pushed += 1;
    } else {
      result.failed += 1;
      const reason = error ?? 'Tracker rejected the request';
      result.failures.push({ id: issue.id, title: issue.title, reason });
      result.errors.push(`"${issue.title.slice(0, 60)}" — ${reason}`);
    }
  }
  return result;
}
