/** Per-project audit trail (Activity tab). GET /api/projects/:projectId/activity */
import type { FastifyInstance } from 'fastify';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';

interface ActivityQuery {
  action?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
  limit?: string;
}

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  /** Filtered, paginated activity log entries. */
  app.get<{ Params: { projectId: string }; Querystring: ActivityQuery }>(
    '/api/projects/:projectId/activity',
    async (request, reply) => {
      const { projectId } = request.params;
      const { action, userId, search, from, to, page, pageSize } = request.query;

      // If no filters are provided, fall back to the simple list for backward compat
      if (!action && !userId && !search && !from && !to && !page) {
        const limit = Math.min(500, Math.max(1, parseInt(request.query.limit as unknown as string ?? '100', 10) || 100));
        return reply.send(await activityLogRepo.listByProject(projectId, limit));
      }

      const result = await activityLogRepo.listFiltered({
        projectId,
        action: action || undefined,
        userId: userId || undefined,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 25,
      });

      return reply.send(result);
    },
  );

  /** Distinct users who have activity in this project (for filter dropdown). */
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/activity/users',
    async (request, reply) => {
      const users = await activityLogRepo.listUsers(request.params.projectId);
      return reply.send(users);
    },
  );
}
