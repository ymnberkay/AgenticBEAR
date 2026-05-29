import type { FastifyInstance } from 'fastify';
import { projectRepo } from '../db/repositories/project.repo.js';
import { workspaceService } from '../services/workspace.service.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  // Browse filesystem directories (for folder picker UI)
  app.get<{ Querystring: { path?: string } }>('/api/fs/dirs', async (request, reply) => {
    const rawPath = request.query.path ?? os.homedir();
    const resolved = path.resolve(rawPath);

    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({ name: e.name, path: path.join(resolved, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const parent = resolved !== path.parse(resolved).root ? path.dirname(resolved) : null;

      return reply.send({ path: resolved, parent, home: os.homedir(), entries: dirs });
    } catch {
      return reply.status(400).send({ error: true, message: `Cannot read directory: ${resolved}` });
    }
  });

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
