/**
 * External tracker integrations.
 *   Org (admin):
 *     GET/POST   /api/integrations            → list / create connection
 *     PATCH/DEL  /api/integrations/:id         → update / remove
 *   Project:
 *     GET   /api/projects/:projectId/integrations         → linked connections
 *     POST  /api/projects/:projectId/integrations         → link { connectionId, syncEnabled }
 *     PATCH /api/project-integrations/:id                 → { syncEnabled }
 *     DEL   /api/project-integrations/:id                 → unlink
 */
import type { FastifyInstance } from 'fastify';
import type { CreateIntegrationConnectionInput, UpdateIntegrationConnectionInput } from '@subagent/shared';
import { integrationRepo } from '../db/repositories/integration.repo.js';
import { requireAdmin } from '../middleware/require-auth.js';

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  // ── Org connections (admin) ──
  app.get('/api/integrations', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send(await integrationRepo.listConnections());
  });

  app.post<{ Body: CreateIntegrationConnectionInput }>('/api/integrations', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { kind, label } = request.body ?? ({} as CreateIntegrationConnectionInput);
    if (!kind || !label?.trim()) return reply.status(400).send({ error: true, message: 'kind and label are required' });
    return reply.status(201).send(await integrationRepo.createConnection(request.body));
  });

  app.patch<{ Params: { id: string }; Body: UpdateIntegrationConnectionInput }>('/api/integrations/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const updated = await integrationRepo.updateConnection(request.params.id, request.body ?? {});
    if (!updated) return reply.status(404).send({ error: true, message: 'Connection not found' });
    return reply.send(updated);
  });

  app.delete<{ Params: { id: string } }>('/api/integrations/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    if (!(await integrationRepo.removeConnection(request.params.id))) return reply.status(404).send({ error: true, message: 'Connection not found' });
    return reply.status(204).send();
  });

  // ── Project links ──
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/integrations', async (request, reply) => {
    return reply.send(await integrationRepo.listProjectIntegrations(request.params.projectId));
  });

  app.post<{ Params: { projectId: string }; Body: { connectionId: string; syncEnabled?: boolean } }>(
    '/api/projects/:projectId/integrations',
    async (request, reply) => {
      const { connectionId, syncEnabled } = request.body ?? ({} as { connectionId: string });
      if (!connectionId) return reply.status(400).send({ error: true, message: 'connectionId is required' });
      return reply.status(201).send(await integrationRepo.linkProject(request.params.projectId, connectionId, syncEnabled ?? true));
    },
  );

  app.patch<{ Params: { id: string }; Body: { syncEnabled: boolean } }>('/api/project-integrations/:id', async (request, reply) => {
    await integrationRepo.setProjectSync(request.params.id, !!request.body?.syncEnabled);
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>('/api/project-integrations/:id', async (request, reply) => {
    if (!(await integrationRepo.unlinkProject(request.params.id))) return reply.status(404).send({ error: true, message: 'Link not found' });
    return reply.status(204).send();
  });
}
