/**
 * Per-project issues.
 *   GET    /api/projects/:projectId/issues          → list
 *   POST   /api/projects/:projectId/issues          → create (+ sync to linked tracker)
 *   PATCH  /api/issues/:id                           → update (status/priority/title/description)
 *   DELETE /api/issues/:id                           → remove
 */
import type { FastifyInstance } from 'fastify';
import type { CreateIssueInput, IssueStatus, IssuePriority } from '@subagent/shared';
import { issueRepo } from '../db/repositories/issue.repo.js';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';
import { createProjectIssue, pushUnsyncedProjectIssues } from '../services/issue.service.js';
import { pullProjectIssues } from '../services/issue-pull.service.js';
import type { AuthedRequest } from '../middleware/require-auth.js';

export async function issueRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/issues', async (request, reply) => {
    return reply.send(await issueRepo.listByProject(request.params.projectId));
  });

  app.post<{ Params: { projectId: string }; Body: CreateIssueInput }>(
    '/api/projects/:projectId/issues',
    async (request, reply) => {
      const { title } = request.body ?? ({} as CreateIssueInput);
      if (!title?.trim()) return reply.status(400).send({ error: true, message: 'title is required' });
      const issue = await createProjectIssue(request.params.projectId, { ...request.body, source: 'user' });
      const user = (request as AuthedRequest).authUser;
      await activityLogRepo.record({ projectId: request.params.projectId, userId: user?.id, username: user?.username, action: 'issue.create', target: issue.title, detail: issue.externalUrl ?? issue.kind });
      return reply.status(201).send(issue);
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<{ status: IssueStatus; priority: IssuePriority; title: string; description: string; labels: string[] }> }>(
    '/api/issues/:id',
    async (request, reply) => {
      const updated = await issueRepo.update(request.params.id, request.body ?? {});
      if (!updated) return reply.status(404).send({ error: true, message: 'Issue not found' });
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/issues/:id', async (request, reply) => {
    if (!(await issueRepo.remove(request.params.id))) return reply.status(404).send({ error: true, message: 'Issue not found' });
    return reply.status(204).send();
  });

  /** Manual inbound sync — pulls new/changed work items from the linked tracker into this project. */
  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/issues/sync',
    async (request, reply) => {
      const result = await pullProjectIssues(request.params.projectId);
      const user = (request as AuthedRequest).authUser;
      await activityLogRepo.record({
        projectId: request.params.projectId, userId: user?.id, username: user?.username,
        action: 'issue.sync',
        target: `${result.imported} imported, ${result.updated} updated`,
        detail: result.errors.length ? result.errors.slice(0, 3).join('; ') : '',
      });
      return reply.send(result);
    },
  );

  /** Push local issues to the linked tracker.
   *  Body { ids: string[] } → retry exactly those; omit/empty → push every unsynced issue. */
  app.post<{ Params: { projectId: string }; Body: { ids?: string[] } }>(
    '/api/projects/:projectId/issues/push',
    async (request, reply) => {
      const ids = Array.isArray(request.body?.ids) ? request.body!.ids.filter((x): x is string => typeof x === 'string') : undefined;
      const result = await pushUnsyncedProjectIssues(request.params.projectId, ids);
      const user = (request as AuthedRequest).authUser;
      await activityLogRepo.record({
        projectId: request.params.projectId, userId: user?.id, username: user?.username,
        action: 'issue.push',
        target: `${result.pushed} pushed, ${result.failed} failed${ids ? ` (retry ${ids.length})` : ''}`,
        detail: result.errors.length ? result.errors.slice(0, 3).join('; ') : '',
      });
      return reply.send(result);
    },
  );
}
