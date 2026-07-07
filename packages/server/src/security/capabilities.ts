/**
 * Effective-capability resolution for a user.
 *
 * A user's capabilities are the UNION of:
 *   - their own built-in role (admin / contributor / viewer), and
 *   - the role of every permission group they belong to (built-in or custom).
 *
 * The union is purely additive — a group role can only GRANT more, never take away. This keeps
 * an admin an admin no matter how groups are configured (no lock-out), while letting a custom
 * role elevate a viewer within the projects their groups grant.
 */
import type { Capability, PermissionGroup, User } from '@subagent/shared';
import { BUILTIN_ROLE_CAPS, WRITE_CAPABILITIES, isBuiltinRole } from '@subagent/shared';
import { groupRepo } from '../db/repositories/group.repo.js';
import { roleRepo } from '../db/repositories/role.repo.js';

/** Custom roles change rarely; cache the id→capabilities map briefly (rbac runs per request). */
let roleCache: { at: number; map: Map<string, Capability[]> } | undefined;
const ROLE_CACHE_TTL_MS = 5000;

async function customRoleCaps(): Promise<Map<string, Capability[]>> {
  if (roleCache && Date.now() - roleCache.at < ROLE_CACHE_TTL_MS) return roleCache.map;
  const map = new Map<string, Capability[]>();
  for (const r of await roleRepo.list()) map.set(r.id, r.capabilities);
  roleCache = { at: Date.now(), map };
  return map;
}

/** Drop the cached custom roles (after a role create/update/delete). */
export function clearRoleCache(): void {
  roleCache = undefined;
}

function capsForRoleRef(ref: string, custom: Map<string, Capability[]>): Capability[] {
  if (isBuiltinRole(ref)) return BUILTIN_ROLE_CAPS[ref];
  return custom.get(ref) ?? [];
}

export interface EffectiveAccess {
  capabilities: Set<Capability>;
  /** Projects reachable via the user's groups (union). */
  projectIds: string[];
  /** admin.full — unrestricted, project scoping bypassed. */
  isFullAdmin: boolean;
  /** Holds at least one write-type capability (non-GET allowed within accessible projects). */
  canWrite: boolean;
}

/** Resolve capabilities + accessible projects in a single groups fetch (used by the rbac hook). */
export async function resolveAccess(user: User): Promise<EffectiveAccess> {
  const groups: PermissionGroup[] = user.groupIds.length ? await groupRepo.findByIds(user.groupIds) : [];
  const custom = await customRoleCaps();

  const caps = new Set<Capability>(BUILTIN_ROLE_CAPS[user.role] ?? []);
  const projectIds = new Set<string>();
  for (const g of groups) {
    for (const c of capsForRoleRef(g.role, custom)) caps.add(c);
    for (const p of g.projectIds) projectIds.add(p);
  }

  const isFullAdmin = caps.has('admin.full');
  const canWrite = isFullAdmin || WRITE_CAPABILITIES.some((c) => caps.has(c));
  return { capabilities: caps, projectIds: [...projectIds], isFullAdmin, canWrite };
}

/** True when the user can reach an admin-only management surface requiring `cap`. */
export async function hasCapability(user: User, cap: Capability): Promise<boolean> {
  const { capabilities, isFullAdmin } = await resolveAccess(user);
  return isFullAdmin || capabilities.has(cap);
}
