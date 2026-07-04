/**
 * Session-mode internal endpoints, polled by the hub (via the pod's ClusterIP Service).
 * Deliberately outside /api/* so the user-auth hook skips them; guarded by the internal HMAC
 * header instead, because the per-user ingress rewrite also exposes this path externally.
 */
import type { FastifyInstance } from 'fastify';
import { verifyInternalHeader } from '../security/internal-auth.js';
import { activitySnapshot } from '../services/session-activity.js';
import { executionEngine } from '../engine/execution-engine.js';

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/internal/activity', async (request, reply) => {
    if (!verifyInternalHeader(request.headers['x-agb-internal'] as string | undefined)) {
      return reply.status(403).send({ error: true, message: 'Forbidden' });
    }
    const { lastActivityAt, openStreams } = activitySnapshot();
    const activeRuns = executionEngine.activeRunCount();
    return reply.send({
      lastActivityAt,
      openStreams,
      activeRuns,
      busy: activeRuns > 0 || openStreams > 0,
    });
  });
}
