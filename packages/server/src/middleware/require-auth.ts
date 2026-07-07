/**
 * User-session auth for the app API (/api/*). Separate from the gateway (/v1, API-key auth).
 * Token via `Authorization: Bearer <token>` or `?token=` (for SSE/EventSource which can't set headers).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@subagent/shared';
import { config } from '../config.js';
import { verifyToken, signToken, needsRefresh } from '../security/auth-service.js';
import { userRepo } from '../db/repositories/user.repo.js';
import { markActivity } from '../services/session-activity.js';
import type { EffectiveAccess } from '../security/capabilities.js';

/** authUser is set by authHook; authAccess by the rbac preHandler (resolved capabilities). */
export type AuthedRequest = FastifyRequest & { authUser?: User; authAccess?: EffectiveAccess };

/**
 * Resolve the session user. Tokens minted before a `token_version` bump (password change,
 * admin "revoke sessions") are rejected even though their HMAC still verifies.
 */
export async function authenticate(request: FastifyRequest, reply?: FastifyReply): Promise<User | null> {
  const header = request.headers['authorization'];
  let token = header && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) token = (request.query as { token?: string } | undefined)?.token;
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims) return null;
  const found = await userRepo.findForAuth(claims.uid);
  if (!found || found.tokenVersion !== claims.tokenVersion) return null;
  // Sliding session: reissue past the half-life; the client swaps tokens transparently.
  if (reply && needsRefresh(claims)) {
    reply.header('x-agb-refresh-token', signToken(claims.uid, found.tokenVersion));
  }
  return found.user;
}

/** Global onRequest hook: gate /api/* (except login) behind a valid session. */
export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.method === 'OPTIONS') return;            // CORS preflight
  const url = request.url.split('?')[0];
  if (!url.startsWith('/api/')) return;                // /v1 gateway, /mcp, static → not user-auth
  // Public: login surfaces (password, SSO redirects, MFA second step), k8s health probe,
  // client bootstrap config.
  if (
    url === '/api/auth/login' || url === '/api/auth/methods' || url === '/api/auth/mfa/verify' ||
    url === '/api/auth/verify' || url.startsWith('/api/auth/sso/') ||
    url === '/api/health' || url === '/api/config'
  ) return;
  const user = await authenticate(request, reply);
  if (!user) {
    reply.status(401).send({ error: true, message: 'Authentication required' });
    return;
  }
  // A session pod serves exactly one user — the ingress path is guessable, so a valid token
  // belonging to anyone else must not reach this runtime.
  if (config.session.userId && user.id !== config.session.userId) {
    reply.status(403).send({ error: true, message: 'This session belongs to another user' });
    return;
  }
  if (config.mode === 'session') markActivity();
  (request as AuthedRequest).authUser = user;
}

/**
 * Gate governance endpoints (users, groups, roles). Built-in admins pass; so do holders of a
 * custom role granting `users.manage` (resolved by the rbac preHandler into request.authAccess).
 */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const { authUser: user, authAccess: access } = request as AuthedRequest;
  const ok = !!user && (user.role === 'admin' || !!access?.isFullAdmin || !!access?.capabilities.has('users.manage'));
  if (!ok) {
    reply.status(403).send({ error: true, message: 'Admin access required' });
    return false;
  }
  return true;
}
