/**
 * User-session auth for the app API (/api/*). Separate from the gateway (/v1, API-key auth).
 * Token via `Authorization: Bearer <token>` or `?token=` (for SSE/EventSource which can't set headers).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@subagent/shared';
import { config } from '../config.js';
import { verifyToken } from '../security/auth-service.js';
import { userRepo } from '../db/repositories/user.repo.js';
import { markActivity } from '../services/session-activity.js';

export type AuthedRequest = FastifyRequest & { authUser?: User };

export async function authenticate(request: FastifyRequest): Promise<User | null> {
  const header = request.headers['authorization'];
  let token = header && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) token = (request.query as { token?: string } | undefined)?.token;
  if (!token) return null;
  const uid = verifyToken(token);
  return uid ? (await userRepo.findById(uid)) ?? null : null;
}

/** Global onRequest hook: gate /api/* (except login) behind a valid session. */
export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.method === 'OPTIONS') return;            // CORS preflight
  const url = request.url.split('?')[0];
  if (!url.startsWith('/api/')) return;                // /v1 gateway, /mcp, static → not user-auth
  if (url === '/api/auth/login' || url === '/api/health') return; // public (login + k8s health probe)
  const user = await authenticate(request);
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

/** Reject non-admin users (for user-management endpoints). */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = (request as AuthedRequest).authUser;
  if (!user || user.role !== 'admin') {
    reply.status(403).send({ error: true, message: 'Admin access required' });
    return false;
  }
  return true;
}
