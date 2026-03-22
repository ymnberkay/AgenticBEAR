import type { FastifyInstance } from 'fastify';
import { projectRepo } from '../db/repositories/project.repo.js';
import { workspaceService } from '../services/workspace.service.js';

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  // Get file tree for project workspace
  app.get<{ Params: { projectId: string } }>('/api/workspace/:projectId/tree', async (request, reply) => {
    const project = projectRepo.findById(request.params.projectId);
    if (!project) {
      return reply.status(404).send({ error: true, message: 'Project not found' });
    }

    try {
      const tree = workspaceService.getFileTree(project.workspacePath);
      return reply.send(tree);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: `Failed to read workspace: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  // Read a file from workspace
  app.get<{ Params: { projectId: string }; Querystring: { path: string } }>(
    '/api/workspace/:projectId/file',
    async (request, reply) => {
      const project = projectRepo.findById(request.params.projectId);
      if (!project) {
        return reply.status(404).send({ error: true, message: 'Project not found' });
      }

      const filePath = request.query.path;
      if (!filePath) {
        return reply.status(400).send({ error: true, message: 'path query parameter is required' });
      }

      try {
        const content = workspaceService.readFile(project.workspacePath, filePath);
        return reply.send({ path: filePath, content });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Path traversal')) {
          return reply.status(403).send({ error: true, message });
        }
        return reply.status(404).send({ error: true, message: `File not found: ${filePath}` });
      }
    },
  );

  // Write a file to workspace
  app.put<{ Params: { projectId: string }; Querystring: { path: string }; Body: { content: string } }>(
    '/api/workspace/:projectId/file',
    async (request, reply) => {
      const project = projectRepo.findById(request.params.projectId);
      if (!project) {
        return reply.status(404).send({ error: true, message: 'Project not found' });
      }

      const filePath = request.query.path;
      if (!filePath) {
        return reply.status(400).send({ error: true, message: 'path query parameter is required' });
      }

      const { content } = request.body;
      if (content === undefined) {
        return reply.status(400).send({ error: true, message: 'content is required in body' });
      }

      try {
        workspaceService.writeFile(project.workspacePath, filePath, content);
        return reply.send({ path: filePath, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Path traversal')) {
          return reply.status(403).send({ error: true, message });
        }
        return reply.status(500).send({ error: true, message });
      }
    },
  );
}
