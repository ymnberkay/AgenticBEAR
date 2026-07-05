import type { FastifyInstance } from 'fastify';
import { documentRepo } from '../db/repositories/document.repo.js';
import type { CreateProjectDocumentInput } from '@subagent/shared';

/**
 * Knowledge documents — bound to one agent via agentId (injected only into that agent's
 * context); legacy documents without agentId stay project-wide.
 *   GET    /api/projects/:projectId/documents
 *   POST   /api/projects/:projectId/documents   { name, content, agentId? }
 *   DELETE /api/documents/:id
 */
export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/documents', async (request, reply) => {
    return reply.send(await documentRepo.findByProjectId(request.params.projectId));
  });

  app.post<{ Params: { projectId: string }; Body: CreateProjectDocumentInput }>(
    '/api/projects/:projectId/documents',
    async (request, reply) => {
      const { name, content, agentId } = request.body ?? {};
      if (!name || !content) {
        return reply.status(400).send({ error: true, message: 'name and content are required' });
      }
      return reply.status(201).send(await documentRepo.create(request.params.projectId, { name, content, agentId: agentId ?? null }));
    },
  );

  app.delete<{ Params: { id: string } }>('/api/documents/:id', async (request, reply) => {
    const removed = await documentRepo.remove(request.params.id);
    if (!removed) return reply.status(404).send({ error: true, message: 'Document not found' });
    return reply.status(204).send();
  });
}
