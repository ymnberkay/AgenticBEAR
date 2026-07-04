/**
 * Hub session-orchestration endpoints (authed via the global authHook):
 *   GET  /api/auth/session       → current user's session status (client polls after login)
 *   POST /api/auth/session/wake  → recreate a reaped/dead session, fire-and-forget
 */
import type { FastifyInstance } from 'fastify';
import type { AuthedRequest } from '../middleware/require-auth.js';
import { sessionManager } from './session-manager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('hub:routes');

export async function hubSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/session', async (request, reply) => {
    const user = (request as AuthedRequest).authUser!;
    return reply.send(sessionManager.getStatus(user.id));
  });

  app.post('/api/auth/session/wake', async (request, reply) => {
    const user = (request as AuthedRequest).authUser!;
    sessionManager.ensureSession({ id: user.id, username: user.username }).catch((err) => log.warn(`ensureSession(${user.username}) failed`, err));
    return reply.send(sessionManager.getStatus(user.id));
  });
}
