/**
 * Approve / reject chat-staged file operations.
 *   GET  /api/projects/:projectId/file-changes/pending     → pending changes awaiting approval
 *   POST /api/projects/:projectId/file-changes/:id/apply   → write/delete to disk, mark applied
 *   POST /api/projects/:projectId/file-changes/:id/reject  → discard, mark rejected
 */
import type { FastifyInstance } from 'fastify';
import type { User } from '@subagent/shared';
import { taskRepo } from '../db/repositories/task.repo.js';
import { runRepo } from '../db/repositories/run.repo.js';
import { projectRepo } from '../db/repositories/project.repo.js';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';
import { workspaceService } from '../services/workspace.service.js';
import type { AuthedRequest } from '../middleware/require-auth.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('file-changes');

export async function fileChangeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/file-changes/pending',
    async (request, reply) => {
      return reply.send(await taskRepo.findPendingFileChangesByProject(request.params.projectId));
    },
  );

  app.post<{ Params: { projectId: string; id: string } }>(
    '/api/projects/:projectId/file-changes/:id/apply',
    async (request, reply) => {
      const { projectId, id } = request.params;
      const change = await taskRepo.findFileChangeById(id);
      if (!change) return reply.status(404).send({ error: true, message: 'Change not found' });
      if (change.status !== 'pending') return reply.status(400).send({ error: true, message: `Change is already ${change.status}` });

      // Scope check: the change's run must belong to this project.
      const run = await runRepo.findById(change.runId);
      if (!run || run.projectId !== projectId) return reply.status(404).send({ error: true, message: 'Change not in this project' });
      const project = await projectRepo.findById(projectId);
      if (!project) return reply.status(404).send({ error: true, message: 'Project not found' });

      try {
        if (change.operation === 'delete') workspaceService.deleteFile(project.workspacePath, change.filePath);
        else workspaceService.writeFile(project.workspacePath, change.filePath, change.newContent);
      } catch (err) {
        log.error('apply file change failed', err);
        return reply.status(500).send({ error: true, message: err instanceof Error ? err.message : 'apply failed' });
      }

      const updated = await taskRepo.setFileChangeStatus(id, 'applied');
      const user = (request as AuthedRequest).authUser as User | undefined;
      await activityLogRepo.record({
        projectId, userId: user?.id, username: user?.username, action: 'file.apply',
        target: change.filePath, detail: change.operation,
      });
      return reply.send(updated);
    },
  );

  app.post<{ Params: { projectId: string; id: string } }>(
    '/api/projects/:projectId/file-changes/:id/reject',
    async (request, reply) => {
      const { projectId, id } = request.params;
      const change = await taskRepo.findFileChangeById(id);
      if (!change) return reply.status(404).send({ error: true, message: 'Change not found' });
      if (change.status !== 'pending') return reply.status(400).send({ error: true, message: `Change is already ${change.status}` });
      const run = await runRepo.findById(change.runId);
      if (!run || run.projectId !== projectId) return reply.status(404).send({ error: true, message: 'Change not in this project' });

      const updated = await taskRepo.setFileChangeStatus(id, 'rejected');
      const user = (request as AuthedRequest).authUser as User | undefined;
      await activityLogRepo.record({
        projectId, userId: user?.id, username: user?.username, action: 'file.reject',
        target: change.filePath, detail: change.operation,
      });
      return reply.send(updated);
    },
  );
}
