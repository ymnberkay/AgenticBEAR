/**
 * Per-project goals.
 *   GET    /api/projects/:projectId/goals          → list (ordered)
 *   POST   /api/projects/:projectId/goals          → create one
 *   POST   /api/projects/:projectId/goals/bulk     → create many (Excel/CSV import)
 *   PATCH  /api/projects/:projectId/goals/reorder  → persist a drag-and-drop reorder
 *   PATCH  /api/goals/:id                          → update title/description/status/priority/dueDate
 *   DELETE /api/goals/:id                          → remove
 */
import type { FastifyInstance } from 'fastify';
import type { CreateGoalInput, UpdateGoalInput } from '@subagent/shared';
import { goalRepo } from '../db/repositories/goal.repo.js';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';
import type { AuthedRequest } from '../middleware/require-auth.js';

export async function goalRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/goals',
    async (request, reply) => {
      return reply.send(await goalRepo.listByProject(request.params.projectId));
    },
  );

  app.post<{ Params: { projectId: string }; Body: CreateGoalInput }>(
    '/api/projects/:projectId/goals',
    async (request, reply) => {
      const { title } = request.body ?? ({} as CreateGoalInput);
      if (!title?.trim()) return reply.status(400).send({ error: true, message: 'title is required' });
      const goal = await goalRepo.create(request.params.projectId, { ...request.body, source: 'user' });
      const user = (request as AuthedRequest).authUser;
      await activityLogRepo.record({
        projectId: request.params.projectId, userId: user?.id, username: user?.username,
        action: 'goal.create', target: goal.title, detail: goal.priority,
      });
      return reply.status(201).send(goal);
    },
  );

  app.post<{ Params: { projectId: string }; Body: { goals: CreateGoalInput[]; source?: 'excel' | 'user' } }>(
    '/api/projects/:projectId/goals/bulk',
    async (request, reply) => {
      const body = request.body ?? ({ goals: [] } as { goals: CreateGoalInput[] });
      const raw = Array.isArray(body.goals) ? body.goals : [];
      // Server-side sanity: drop blanks, trim, cap each title length.
      const cleaned: CreateGoalInput[] = raw
        .map((g) => ({
          title: (g?.title ?? '').toString().trim().slice(0, 500),
          description: (g?.description ?? '').toString().slice(0, 5_000),
          status: g?.status,
          priority: g?.priority,
          dueDate: g?.dueDate ?? null,
          source: body.source ?? 'excel',
        }))
        .filter((g) => g.title.length > 0);
      if (cleaned.length === 0) return reply.status(400).send({ error: true, message: 'No valid goals in payload' });
      const goals = await goalRepo.bulkCreate(request.params.projectId, cleaned);
      const user = (request as AuthedRequest).authUser;
      await activityLogRepo.record({
        projectId: request.params.projectId, userId: user?.id, username: user?.username,
        action: 'goal.import', target: `${goals.length} goals`, detail: body.source ?? 'excel',
      });
      return reply.status(201).send({ created: goals.length, goals });
    },
  );

  app.patch<{ Params: { projectId: string }; Body: { order: Array<{ id: string; orderIndex: number }> } }>(
    '/api/projects/:projectId/goals/reorder',
    async (request, reply) => {
      const order = request.body?.order;
      if (!Array.isArray(order)) return reply.status(400).send({ error: true, message: 'order array required' });
      await goalRepo.reorder(request.params.projectId, order);
      return reply.send({ ok: true });
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateGoalInput }>(
    '/api/goals/:id',
    async (request, reply) => {
      const updated = await goalRepo.update(request.params.id, request.body ?? {});
      if (!updated) return reply.status(404).send({ error: true, message: 'Goal not found' });
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/goals/:id',
    async (request, reply) => {
      if (!(await goalRepo.remove(request.params.id))) return reply.status(404).send({ error: true, message: 'Goal not found' });
      return reply.status(204).send();
    },
  );
}
