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
import { userRepo } from '../db/repositories/user.repo.js';
import { userUsageRepo } from '../db/repositories/user-usage.repo.js';

export interface QuotaCheck {
  allowed: boolean;
  /** Which budget this check describes — for the 429 message. */
  scope: 'group' | 'user';
  /** null = unlimited (no group, or group without a quota). */
  groupId: string | null;
  used: number;
  quota: number | null;
  remaining: number | null;
}

const UNLIMITED: QuotaCheck = { allowed: true, scope: 'group', groupId: null, used: 0, quota: null, remaining: null };

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
  return { allowed: remaining > 0, scope: 'group', groupId, used: usage.totalTokens, quota, remaining };
}

/** Is the user within their personal monthly token quota? Unlimited for admins / no quota set. */
export async function checkUserQuota(userId: string | null): Promise<QuotaCheck> {
  if (!userId) return { ...UNLIMITED, scope: 'user' };
  const user = await userRepo.findById(userId);
  if (!user || user.role === 'admin') return { ...UNLIMITED, scope: 'user' };
  const quota = user.tokenQuota ?? null;
  if (!quota || quota <= 0) return { ...UNLIMITED, scope: 'user' };
  const usage = await userUsageRepo.getPeriod(userId);
  const remaining = quota - usage.totalTokens;
  return { allowed: remaining > 0, scope: 'user', groupId: null, used: usage.totalTokens, quota, remaining };
}

/**
 * Enforce both the user's personal quota and their group's shared quota. Returns the first
 * exceeded check (so the 429 names the right budget), or an allowed result when both pass.
 */
export async function checkCombinedQuota(userId: string | null, groupId: string | null): Promise<QuotaCheck> {
  const userCheck = await checkUserQuota(userId);
  if (!userCheck.allowed) return userCheck;
  const groupCheck = await checkQuota(groupId);
  if (!groupCheck.allowed) return groupCheck;
  return groupCheck;
}

/** Record consumption against a group's monthly pool (for both quota + the by-group dashboard). */
export async function recordQuotaUsage(groupId: string | null, inputTokens: number, outputTokens: number, costUsd: number): Promise<void> {
  if (!groupId) return;
  await groupUsageRepo.increment(groupId, inputTokens, outputTokens, costUsd);
}

/** Record consumption against a user's personal monthly pool. No-op when there's no acting user. */
export async function recordUserUsage(userId: string | null, inputTokens: number, outputTokens: number, costUsd: number): Promise<void> {
  if (!userId) return;
  await userUsageRepo.increment(userId, inputTokens, outputTokens, costUsd);
}

/** Record both group + user consumption for a user-attributed request. */
export async function recordCombinedUsage(userId: string | null, groupId: string | null, inputTokens: number, outputTokens: number, costUsd: number): Promise<void> {
  await recordQuotaUsage(groupId, inputTokens, outputTokens, costUsd);
  await recordUserUsage(userId, inputTokens, outputTokens, costUsd);
}

/** Human-readable reason for a 429, e.g. for the chat SSE / gateway error body. */
export function quotaExceededMessage(check: QuotaCheck): string {
  const scope = check.scope === 'user' ? 'your account' : 'this group';
  return `Monthly token quota exceeded for ${scope} (${check.used.toLocaleString()} / ${check.quota?.toLocaleString()} tokens). Resets at the start of next month.`;
}
