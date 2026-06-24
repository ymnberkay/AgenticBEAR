import type { FastifyInstance } from 'fastify';
import { projectRepo } from '../db/repositories/project.repo.js';
import type { CreateProjectInput, UpdateProjectInput } from '@subagent/shared';
import { type AuthedRequest } from '../middleware/require-auth.js';
import { accessibleProjectIds } from '../middleware/rbac.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // List projects — admins see all; others only those granted via their permission groups.
  app.get('/api/projects', async (request, reply) => {
    const projects = await projectRepo.findAll();
    const user = (request as AuthedRequest).authUser;
    if (!user || user.role === 'admin') return reply.send(projects);
    const allowed = new Set(await accessibleProjectIds(user));
    return reply.send(projects.filter((p) => allowed.has(p.id)));
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
    const { name, description, workspacePath } = request.body;

    if (!name) {
      return reply.status(400).send({ error: true, message: 'name is required' });
    }

    const resolvedPath = workspacePath || `/workspace/${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
    const project = await projectRepo.create({ name, description, workspacePath: resolvedPath });
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
}
