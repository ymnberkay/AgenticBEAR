/** Per-project audit trail (Activity tab). GET /api/projects/:projectId/activity */
import type { FastifyInstance } from 'fastify';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string }; Querystring: { limit?: string } }>(
    '/api/projects/:projectId/activity',
    async (request, reply) => {
      const limit = Math.min(500, Math.max(1, parseInt(request.query.limit ?? '100', 10) || 100));
      return reply.send(await activityLogRepo.listByProject(request.params.projectId, limit));
    },
  );
}
