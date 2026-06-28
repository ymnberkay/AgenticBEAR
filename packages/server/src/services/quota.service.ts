/**
 * Group token quotas — a shared monthly token pool per permission group (blank/0 = unlimited).
 *
 * Attribution rule: a chat/agentic request draws from the acting user's first group that grants
 * access to the project (else their first group). Admins are exempt. Gateway requests draw from
 * the calling key's linked group. Enforcement is check-then-record (small over-shoot possible
 * under concurrency — acceptable for budgets).
 */
import type { User, GatewayKey } from '@subagent/shared';
import { groupRepo } from '../db/repositories/group.repo.js';
import { groupUsageRepo } from '../db/repositories/group-usage.repo.js';

export interface QuotaCheck {
  allowed: boolean;
  /** null = unlimited (no group, or group without a quota). */
  groupId: string | null;
  used: number;
  quota: number | null;
  remaining: number | null;
}

const UNLIMITED: QuotaCheck = { allowed: true, groupId: null, used: 0, quota: null, remaining: null };

/** The group a user's request counts against, or null (admin / no group). */
export async function resolveGroupForUser(user: User | null | undefined, projectId?: string): Promise<string | null> {
  if (!user || user.role === 'admin') return null;
  if (!user.groupIds || user.groupIds.length === 0) return null;
  const groups = await groupRepo.findByIds(user.groupIds);
  if (groups.length === 0) return null;
  if (projectId) {
    const match = groups.find((g) => g.projectIds.includes(projectId));
    if (match) return match.id;
  }
  return groups[0].id;
}

export function resolveGroupForKey(key: GatewayKey | null | undefined): string | null {
  return key?.groupId ?? null;
}

/** Is the group within its monthly token quota? Unlimited when no group / no quota set. */
export async function checkQuota(groupId: string | null): Promise<QuotaCheck> {
  if (!groupId) return UNLIMITED;
  const [group] = await groupRepo.findByIds([groupId]);
  const quota = group?.tokenQuota ?? null;
  if (!quota || quota <= 0) return { ...UNLIMITED, groupId };
  const usage = await groupUsageRepo.getPeriod(groupId);
  const remaining = quota - usage.totalTokens;
  return { allowed: remaining > 0, groupId, used: usage.totalTokens, quota, remaining };
}

/** Record consumption against a group's monthly pool (for both quota + the by-group dashboard). */
export async function recordQuotaUsage(groupId: string | null, inputTokens: number, outputTokens: number, costUsd: number): Promise<void> {
  if (!groupId) return;
  await groupUsageRepo.increment(groupId, inputTokens, outputTokens, costUsd);
}

/** Human-readable reason for a 429, e.g. for the chat SSE / gateway error body. */
export function quotaExceededMessage(check: QuotaCheck): string {
  return `Monthly token quota exceeded for this group (${check.used.toLocaleString()} / ${check.quota?.toLocaleString()} tokens). Resets at the start of next month.`;
}
