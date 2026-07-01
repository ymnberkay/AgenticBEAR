import type { FastifyInstance } from 'fastify';
import { projectRepo } from '../db/repositories/project.repo.js';
import { agentRepo } from '../db/repositories/agent.repo.js';
import type { CreateProjectInput, UpdateProjectInput } from '@subagent/shared';
import { type AuthedRequest } from '../middleware/require-auth.js';
import { accessibleProjectIds } from '../middleware/rbac.js';
import { cloneProject, gitStatus, gitBranches, gitCheckoutBranch } from '../services/git-workspace.service.js';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // List projects — admins see all; others only those granted via their permission groups.
  app.get('/api/projects', async (request, reply) => {
    const projects = await projectRepo.findAll();
    const counts = await agentRepo.countsByProject();
    const withCounts = projects.map((p) => ({ ...p, agentCount: counts[p.id] ?? 0 }));
    const user = (request as AuthedRequest).authUser;
    if (!user || user.role === 'admin') return reply.send(withCounts);
    const allowed = new Set(await accessibleProjectIds(user));
    return reply.send(withCounts.filter((p) => allowed.has(p.id)));
  });

  // Get project by ID
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const project = await projectRepo.findById(request.params.id);
    if (!project) {
      return reply.status(404).send({ error: true, message: 'Project not found' });
    }
    return reply.send(project);
  });

  // Create project
  app.post<{ Body: CreateProjectInput }>('/api/projects', async (request, reply) => {
    const { name, description, workspacePath, workspaceSource, gitUrl, gitConnectionId, gitDefaultBranch } = request.body;

    if (!name) {
      return reply.status(400).send({ error: true, message: 'name is required' });
    }

    const source = workspaceSource ?? 'local';
    if (source === 'git' && !gitUrl) {
      return reply.status(400).send({ error: true, message: 'gitUrl is required when workspaceSource is git' });
    }
    // For local projects preserve the old default of /workspace/<slug>. For git projects the
    // server-side clone path is computed at clone time so no default is needed here.
    const resolvedPath = source === 'local'
      ? (workspacePath || `/workspace/${name.trim().toLowerCase().replace(/\s+/g, '-')}`)
      : (workspacePath || '');
    const project = await projectRepo.create({
      name, description, workspacePath: resolvedPath,
      workspaceSource: source, gitUrl, gitConnectionId, gitDefaultBranch,
    });
    return reply.status(201).send(project);
  });

  // Update project
  app.patch<{ Params: { id: string }; Body: UpdateProjectInput }>('/api/projects/:id', async (request, reply) => {
    const project = await projectRepo.update(request.params.id, request.body);
    if (!project) {
      return reply.status(404).send({ error: true, message: 'Project not found' });
    }
    return reply.send(project);
  });

  // Delete project
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const removed = await projectRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Project not found' });
    }
    return reply.status(204).send();
  });

  // ── Git-backed workspace: clone + read status ──────────────────────────────
  /** Clone (or re-clone) the project's git URL into the server-side local mirror. */
  app.post<{ Params: { id: string } }>('/api/projects/:id/git/clone', async (request, reply) => {
    const project = await projectRepo.findById(request.params.id);
    if (!project) return reply.status(404).send({ error: true, message: 'Project not found' });
    if (project.workspaceSource !== 'git') return reply.status(400).send({ error: true, message: 'Project workspace source is not git.' });
    if (!project.gitUrl) return reply.status(400).send({ error: true, message: 'Set a git URL in Project → Settings before cloning.' });

    const result = await cloneProject(project);
    await projectRepo.setGitCloneState(project.id, {
      status: result.status,
      localPath: result.localPath || undefined,
      lastCloneAt: result.status === 'ready' ? new Date().toISOString() : undefined,
      error: result.error,
    });
    const user = (request as AuthedRequest).authUser;
    await activityLogRepo.record({
      projectId: project.id, userId: user?.id, username: user?.username,
      action: 'git.clone', target: project.gitUrl, detail: result.status,
    });
    if (result.status === 'error') {
      return reply.status(422).send({ error: true, message: result.error || 'Clone failed.' });
    }
    return reply.send(await projectRepo.findById(project.id));
  });

  /** Read the current git status of the project's local mirror. */
  app.get<{ Params: { id: string } }>('/api/projects/:id/git/status', async (request, reply) => {
    const project = await projectRepo.findById(request.params.id);
    if (!project) return reply.status(404).send({ error: true, message: 'Project not found' });
    if (project.workspaceSource !== 'git') return reply.send({ ok: false, error: 'Not a git-source project' });
    if (project.gitCloneStatus !== 'ready') return reply.send({ ok: false, error: `Clone status: ${project.gitCloneStatus}` });
    return reply.send(await gitStatus(project));
  });

  /** List local + remote branches of the project's local mirror. */
  app.get<{ Params: { id: string } }>('/api/projects/:id/git/branches', async (request, reply) => {
    const project = await projectRepo.findById(request.params.id);
    if (!project) return reply.status(404).send({ error: true, message: 'Project not found' });
    if (project.workspaceSource !== 'git') return reply.send({ ok: false, error: 'Not a git-source project' });
    if (project.gitCloneStatus !== 'ready') return reply.send({ ok: false, error: `Clone status: ${project.gitCloneStatus}` });
    return reply.send(await gitBranches(project));
  });

  /** Switch to (or create) a branch. Body: { branch: string; create?: boolean } */
  app.post<{ Params: { id: string }; Body: { branch: string; create?: boolean } }>(
    '/api/projects/:id/git/checkout',
    async (request, reply) => {
      const branch = (request.body?.branch ?? '').trim();
      const create = request.body?.create === true;
      if (!branch) return reply.status(400).send({ error: true, message: 'branch is required' });
      const project = await projectRepo.findById(request.params.id);
      if (!project) return reply.status(404).send({ error: true, message: 'Project not found' });
      if (project.workspaceSource !== 'git') return reply.status(400).send({ error: true, message: 'Not a git-source project' });
      if (project.gitCloneStatus !== 'ready') return reply.status(400).send({ error: true, message: `Clone status: ${project.gitCloneStatus}` });
      const r = await gitCheckoutBranch(project, branch, create);
      const user = (request as AuthedRequest).authUser;
      await activityLogRepo.record({
        projectId: project.id, userId: user?.id, username: user?.username,
        action: create ? 'git.branch.create' : 'git.checkout',
        target: branch, detail: r.ok ? 'ok' : (r.error ?? 'error'),
      });
      if (!r.ok) return reply.status(422).send({ error: true, message: r.error ?? 'checkout failed' });
      return reply.send({ ok: true, branch });
    },
  );
}
