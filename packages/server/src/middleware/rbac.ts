/**
 * Project-level RBAC enforcement (after authHook attaches request.authUser).
 *   - admin  → full access (bypass).
 *   - others → only projects in their permission groups; viewers are read-only.
 * Resolves the projectId from the URL (project/workspace/events paths, or via run/agent id).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@subagent/shared';
import { type AuthedRequest } from './require-auth.js';
import { groupRepo } from '../db/repositories/group.repo.js';
import { runRepo } from '../db/repositories/run.repo.js';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { resolveAccess } from '../security/capabilities.js';

/** Project ids a user may access (admin → all handled by callers; here = group union). */
export function accessibleProjectIds(user: User): Promise<string[]> {
  return groupRepo.projectIdsFor(user.groupIds);
}

/**
 * The projectId a request targets:
 *  - string  → that project,
 *  - null    → project-scoped but entity not found (let the route 404),
 *  - undefined → not a project-scoped route (skip RBAC).
 */
async function resolveProjectId(url: string): Promise<string | null | undefined> {
  const p = url.split('/').filter(Boolean); // ['api','projects','<id>', ...]
  if (p[0] !== 'api') return undefined;
  if (p[1] === 'projects') return p[2]; // undefined for the list endpoint
  if (p[1] === 'workspace' && p[2]) return p[2];
  if (p[1] === 'events' && p[2] === 'project') return p[3];
  if (p[1] === 'events' && p[2]) return (await runRepo.findById(p[2]))?.projectId ?? null;
  if (p[1] === 'runs' && p[2]) return (await runRepo.findById(p[2]))?.projectId ?? null;
  if (p[1] === 'agents' && p[2]) return (await agentRepo.findById(p[2]))?.projectId ?? null;
  return undefined;
}

/**
 * Org-management surfaces that only admins may touch: gateway API keys, LLM providers, global
 * settings, and the gateway usage dashboard. Enforced centrally here so a missing per-handler
 * `requireAdmin` can't silently expose them. `/api/models` (the read-only model catalog used by
 * pickers) is deliberately NOT included — it stays available to every authenticated user.
 */
const ADMIN_ONLY_PREFIXES = ['/api/gateway-keys', '/api/gateway-usage', '/api/providers', '/api/settings'];

export async function rbacHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = (request as AuthedRequest).authUser;
  if (!user) return; // unauth handled earlier
  const url = request.url.split('?')[0];
  if (!url.startsWith('/api/')) return;
  const method = request.method;

  // Effective capabilities = own role ∪ every group's role (custom roles included). Additive,
  // so admin.full always wins. One resolve per request; also yields accessible project ids.
  const access = await resolveAccess(user);
  (request as AuthedRequest).authAccess = access; // read by requireAdmin in governance routes
  if (access.isFullAdmin) return; // full administrator — unrestricted

  // Admin-only management surfaces — block anyone lacking the matching capability (reads
  // included; these leak provider config / key metadata).
  if (ADMIN_ONLY_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`))) {
    const cap = url.startsWith('/api/settings') ? 'settings.manage' : 'gateway.manage';
    if (!access.capabilities.has(cap)) {
      reply.status(403).send({ error: true, message: 'Admin access required' });
      return;
    }
    return; // holds the capability → allowed
  }

  // Project creation needs the projects.create capability.
  if (url === '/api/projects' && method === 'POST') {
    if (!access.capabilities.has('projects.create')) {
      reply.status(403).send({ error: true, message: 'You do not have permission to create projects' });
    }
    return;
  }
  if (url === '/api/projects' && method === 'GET') return; // list route filters to accessible

  const pid = await resolveProjectId(url);
  if (pid === undefined || pid === null) return; // not project-scoped, or entity missing (route 404s)

  if (!access.projectIds.includes(pid)) {
    reply.status(403).send({ error: true, message: 'No access to this project' });
    return;
  }
  if (method !== 'GET' && !access.canWrite) {
    reply.status(403).send({ error: true, message: 'Read-only access' });
  }
}
