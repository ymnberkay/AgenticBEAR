import type { FastifyInstance } from 'fastify';
import { projectRepo } from '../db/repositories/project.repo.js';
import type { CreateProjectInput, UpdateProjectInput } from '@subagent/shared';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // List all projects
  app.get('/api/projects', async (_request, reply) => {
    const projects = projectRepo.findAll();
    return reply.send(projects);
  });

  // Get project by ID
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const project = projectRepo.findById(request.params.id);
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
    const project = projectRepo.create({ name, description, workspacePath: resolvedPath });
    return reply.status(201).send(project);
  });

  // Update project
  app.patch<{ Params: { id: string }; Body: UpdateProjectInput }>('/api/projects/:id', async (request, reply) => {
    const project = projectRepo.update(request.params.id, request.body);
    if (!project) {
      return reply.status(404).send({ error: true, message: 'Project not found' });
    }
    return reply.send(project);
  });

  // Delete project
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const removed = projectRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Project not found' });
    }
    return reply.status(204).send();
  });
}
