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
import { resolveProjectWorkspace, gitCommit, gitPush } from '../services/git-workspace.service.js';
import { agentRepo } from '../db/repositories/agent.repo.js';
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
      // Resolve the actual workspace directory (local path or git clone mirror).
      const wsPath = resolveProjectWorkspace(project);
      if (!wsPath || !wsPath.trim()) {
        return reply.status(400).send({ error: true, message: 'This project has no workspace directory configured. Set one in Project → Settings, then retry.' });
      }
      // Git-source projects that haven't been cloned yet have a would-be path but no directory.
      if (project.workspaceSource === 'git' && project.gitCloneStatus !== 'ready') {
        return reply.status(400).send({ error: true, message: 'The project git repository has not been cloned yet. Clone it from Project → Settings, then retry.' });
      }

      let commandOutput: string | undefined;
      try {
        if (change.operation === 'command') {
          // The command string is stored in filePath; run it now that the user approved.
          const r = workspaceService.runCommand(wsPath, change.filePath);
          const combined = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
          const status = r.timedOut ? 'timed out' : `exit ${r.code ?? 'null'}`;
          commandOutput = `[${status}]\n${combined || '(no output)'}`;
        } else if (change.operation === 'git_commit') {
          // filePath holds the commit message; project.workspaceSource must be 'git'.
          if (project.workspaceSource !== 'git') {
            return reply.status(400).send({ error: true, message: 'Cannot git_commit on a local-source project.' });
          }
          const author = await agentRepo.findById(change.agentId);
          const r = await gitCommit(project, change.filePath, author?.name ?? 'Agent', 'noreply@agenticbear.local');
          commandOutput = r.ok ? `Committed as ${r.sha?.slice(0, 8) ?? '(unknown sha)'}.` : `Commit failed: ${r.error}`;
          if (!r.ok) return reply.status(500).send({ error: true, message: r.error ?? 'Commit failed' });
        } else if (change.operation === 'git_push') {
          if (project.workspaceSource !== 'git') {
            return reply.status(400).send({ error: true, message: 'Cannot git_push on a local-source project.' });
          }
          const branch = change.filePath.trim() || undefined;
          const r = await gitPush(project, branch);
          commandOutput = r.ok ? `Pushed to origin/${branch ?? project.gitDefaultBranch}.` : `Push failed: ${r.error}`;
          if (!r.ok) return reply.status(500).send({ error: true, message: r.error ?? 'Push failed' });
        } else if (change.operation === 'delete') {
          workspaceService.deleteFile(wsPath, change.filePath);
        } else {
          workspaceService.writeFile(wsPath, change.filePath, change.newContent);
        }
      } catch (err) {
        log.error('apply file change failed', err);
        return reply.status(500).send({ error: true, message: err instanceof Error ? err.message : 'apply failed' });
      }

      const updated = await taskRepo.setFileChangeStatus(id, 'applied');
      const user = (request as AuthedRequest).authUser as User | undefined;
      const action = change.operation === 'command' ? 'command.run'
        : change.operation === 'git_commit' ? 'git.commit'
        : change.operation === 'git_push' ? 'git.push'
        : 'file.apply';
      await activityLogRepo.record({
        projectId, userId: user?.id, username: user?.username,
        action, target: change.filePath, detail: change.operation,
      });
      return reply.send({ ...updated, commandOutput });
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
