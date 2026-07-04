import type { FastifyInstance } from 'fastify';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { taskRepo } from '../db/repositories/task.repo.js';
import { activityRepo } from '../db/repositories/activity.repo.js';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';
import { memoryRepo } from '../db/repositories/memory.repo.js';
import { invalidateMcpCache } from '../mcp/server.js';
import { invalidateNamespace, namespaceFor } from '../cost/layers/semantic-cache.js';
import type { AuthedRequest } from '../middleware/require-auth.js';
import type { CreateAgentInput, UpdateAgentInput, User } from '@subagent/shared';
import { testExternalAgent } from '../services/external-agent.service.js';

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // List agents by project
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/agents', async (request, reply) => {
    const agents = await agentRepo.findByProjectId(request.params.projectId);
    return reply.send(agents);
  });

  // Create agent for project
  app.post<{ Params: { projectId: string }; Body: Omit<CreateAgentInput, 'projectId'> }>(
    '/api/projects/:projectId/agents',
    async (request, reply) => {
      const { projectId } = request.params;
      const { role, name, systemPrompt, ...rest } = request.body;

      if (!name || !role) {
        return reply.status(400).send({ error: true, message: 'name and role are required' });
      }

      const agent = await agentRepo.create({
        projectId,
        role,
        name,
        systemPrompt,
        ...rest,
        modelConfig: rest.modelConfig ?? { model: 'claude-sonnet-4-20250514', maxTokens: 8192, temperature: 0.7 },
      });

      invalidateMcpCache(projectId);
      const user = (request as AuthedRequest).authUser as User | undefined;
      await activityLogRepo.record({ projectId, userId: user?.id, username: user?.username, action: 'agent.create', target: agent.name, detail: agent.role });
      return reply.status(201).send(agent);
    },
  );

  // Get agent by ID
  app.get<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const agent = await agentRepo.findById(request.params.id);
    if (!agent) {
      return reply.status(404).send({ error: true, message: 'Agent not found' });
    }
    return reply.send(agent);
  });

  // Update agent
  app.patch<{ Params: { id: string }; Body: UpdateAgentInput }>('/api/agents/:id', async (request, reply) => {
    const agent = await agentRepo.update(request.params.id, request.body);
    if (!agent) {
      return reply.status(404).send({ error: true, message: 'Agent not found' });
    }
    invalidateMcpCache(agent.projectId);
    // Sistem promptu / model değiştiyse bu agent'ın L1 cache namespace'ini temizle.
    if (request.body.systemPrompt !== undefined || request.body.modelConfig !== undefined) {
      void invalidateNamespace(namespaceFor({ projectId: agent.projectId, role: agent.role, agentSlug: agent.slug, providerId: agent.modelConfig.providerId ?? undefined, model: agent.modelConfig.model }));
    }
    const user = (request as AuthedRequest).authUser as User | undefined;
    await activityLogRepo.record({ projectId: agent.projectId, userId: user?.id, username: user?.username, action: 'agent.update', target: agent.name });
    return reply.send(agent);
  });

  // Test an external agent — sends a "ping" and returns latency + sample response.
  app.post<{ Params: { id: string } }>('/api/agents/:id/test', async (request, reply) => {
    const agent = await agentRepo.findById(request.params.id);
    if (!agent) return reply.status(404).send({ error: true, message: 'Agent not found' });
    if (agent.role !== 'external') return reply.status(400).send({ error: true, message: 'Only external agents can be tested' });
    const result = await testExternalAgent(request.params.id);
    return reply.send(result);
  });

  // Get tasks for an agent
  app.get<{ Params: { id: string } }>('/api/agents/:id/tasks', async (request, reply) => {
    const tasks = await taskRepo.findByAgentId(request.params.id);
    return reply.send(tasks);
  });

  // Get activities for an agent
  app.get<{ Params: { id: string } }>('/api/agents/:id/activities', async (request, reply) => {
    const activities = await activityRepo.findByAgentId(request.params.id);
    return reply.send(activities);
  });

  // Delete a single activity
  app.delete<{ Params: { id: string } }>('/api/activities/:id', async (request, reply) => {
    const removed = await activityRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Activity not found' });
    }
    return reply.status(204).send();
  });

  // Clear all activities for an agent
  app.delete<{ Params: { id: string } }>('/api/agents/:id/activities', async (request, reply) => {
    const count = await activityRepo.removeByAgentId(request.params.id);
    return reply.send({ deleted: count });
  });

  // ── Memory routes ───────────────────────────────────────────────────────────

  // Get all memories for an agent
  app.get<{ Params: { id: string } }>('/api/agents/:id/memories', async (request, reply) => {
    const memories = await memoryRepo.findAllByAgentId(request.params.id);
    return reply.send(memories);
  });

  // Delete a single memory
  app.delete<{ Params: { id: string } }>('/api/memories/:id', async (request, reply) => {
    const removed = await memoryRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Memory not found' });
    }
    return reply.status(204).send();
  });

  // Clear all memories for an agent
  app.delete<{ Params: { id: string } }>('/api/agents/:id/memories', async (request, reply) => {
    const count = await memoryRepo.removeByAgentId(request.params.id);
    return reply.send({ deleted: count });
  });

  // Clear all memories for a project
  app.delete<{ Params: { projectId: string } }>('/api/projects/:projectId/memories', async (request, reply) => {
    const count = await memoryRepo.removeByProjectId(request.params.projectId);
    return reply.send({ deleted: count });
  });

  // Delete agent
  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const existing = await agentRepo.findById(request.params.id);
    const removed = await agentRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Agent not found' });
    }
    if (existing) {
      invalidateMcpCache(existing.projectId);
      void invalidateNamespace(namespaceFor({ projectId: existing.projectId, role: existing.role, agentSlug: existing.slug, providerId: existing.modelConfig.providerId ?? undefined, model: existing.modelConfig.model }));
      const user = (request as AuthedRequest).authUser as User | undefined;
      await activityLogRepo.record({ projectId: existing.projectId, userId: user?.id, username: user?.username, action: 'agent.delete', target: existing.name });
    }
    return reply.status(204).send();
  });
}
