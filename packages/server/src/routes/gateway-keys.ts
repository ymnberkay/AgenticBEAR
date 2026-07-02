import type { FastifyInstance } from 'fastify';
import { gatewayKeyRepo } from '../db/repositories/gateway-key.repo.js';
import { gatewayUsageRepo } from '../db/repositories/gateway-usage.repo.js';
import { buildModelCatalog } from './gateway.js';
import type { CreateGatewayKeyInput } from '@subagent/shared';

/**
 * Admin endpoints for the gateway (UI / Models tab):
 *   GET    /api/gateway-keys             → list (prefix only, no secret)
 *   POST   /api/gateway-keys             → create (returns full key ONCE)
 *   PATCH  /api/gateway-keys/:id         → enable/disable, scope, group, rate limit
 *   POST   /api/gateway-keys/:id/regenerate → rotate the secret (returns new full key ONCE)
 *   DELETE /api/gateway-keys/:id         → delete
 *   GET    /api/gateway-usage            → usage/cost summary (optional ?sinceDays=)
 */
export async function gatewayKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/gateway-keys', async (_request, reply) => {
    return reply.send(await gatewayKeyRepo.list());
  });

  app.post<{ Body: CreateGatewayKeyInput }>('/api/gateway-keys', async (request, reply) => {
    const { name, allowedModels, expiresAt, cacheScope, groupId, rateLimitPerMin } = request.body ?? {};
    const created = await gatewayKeyRepo.create({
      name: name ?? '', allowedModels: allowedModels ?? [], expiresAt: expiresAt ?? null, cacheScope, groupId: groupId ?? null,
      rateLimitPerMin: rateLimitPerMin ?? null,
    });
    // Full key returned only here.
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean; cacheScope?: 'conversation' | 'lastUser'; groupId?: string | null; rateLimitPerMin?: number | null } }>(
    '/api/gateway-keys/:id',
    async (request, reply) => {
      const { enabled, cacheScope, groupId, rateLimitPerMin } = request.body ?? {};
      let key = cacheScope ? await gatewayKeyRepo.setCacheScope(request.params.id, cacheScope) : undefined;
      if (groupId !== undefined) key = await gatewayKeyRepo.setGroup(request.params.id, groupId);
      if (rateLimitPerMin !== undefined) {
        key = await gatewayKeyRepo.setLimits(request.params.id, { rateLimitPerMin });
      }
      if (enabled !== undefined) key = await gatewayKeyRepo.setEnabled(request.params.id, enabled);
      if (!key && enabled === undefined && !cacheScope && groupId === undefined && rateLimitPerMin === undefined) {
        key = await gatewayKeyRepo.setEnabled(request.params.id, true);
      }
      if (!key) return reply.status(404).send({ error: true, message: 'Key not found' });
      return reply.send(key);
    },
  );

  // Rotate a key's secret. Returns the new full key ONCE (same shape as create).
  app.post<{ Params: { id: string } }>('/api/gateway-keys/:id/regenerate', async (request, reply) => {
    const rotated = await gatewayKeyRepo.regenerate(request.params.id);
    if (!rotated) return reply.status(404).send({ error: true, message: 'Key not found' });
    return reply.status(201).send(rotated);
  });

  app.delete<{ Params: { id: string } }>('/api/gateway-keys/:id', async (request, reply) => {
    const removed = await gatewayKeyRepo.remove(request.params.id);
    if (!removed) return reply.status(404).send({ error: true, message: 'Key not found' });
    return reply.status(204).send();
  });

  // Catalog for the admin UI (no gateway-key auth — same data as /v1/models).
  // ?refresh=1 bypasses the live-discovery cache (e.g. right after adding a key).
  app.get<{ Querystring: { refresh?: string } }>('/api/models', async (request, reply) => {
    const force = request.query.refresh === '1' || request.query.refresh === 'true';
    return reply.send({ object: 'list', data: await buildModelCatalog(force) });
  });

  app.get<{ Querystring: { sinceDays?: string; range?: string; keyId?: string; model?: string } }>(
    '/api/gateway-usage',
    async (request, reply) => {
      const { sinceDays, range, keyId, model } = request.query;
      const rangeMs: Record<string, number> = {
        '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, '90d': 90 * 86_400_000,
      };
      let since: string | undefined;
      if (range && range !== 'all') since = new Date(Date.now() - (rangeMs[range] ?? rangeMs['30d'])).toISOString();
      else if (sinceDays && Number.isFinite(parseInt(sinceDays, 10))) since = new Date(Date.now() - parseInt(sinceDays, 10) * 86_400_000).toISOString();
      return reply.send(await gatewayUsageRepo.summary({ since, keyId, model }));
    },
  );
}
