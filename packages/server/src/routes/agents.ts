import type { FastifyInstance } from 'fastify';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { taskRepo } from '../db/repositories/task.repo.js';
import { activityRepo } from '../db/repositories/activity.repo.js';
import { invalidateMcpCache } from '../mcp/server.js';
import type { CreateAgentInput, UpdateAgentInput } from '@subagent/shared';

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // List agents by project
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/agents', async (request, reply) => {
    const agents = agentRepo.findByProjectId(request.params.projectId);
    return reply.send(agents);
  });

  // Create agent for project
  app.post<{ Params: { projectId: string }; Body: Omit<CreateAgentInput, 'projectId'> }>(
    '/api/projects/:projectId/agents',
    async (request, reply) => {
      const { projectId } = request.params;
      const { role, name, systemPrompt, ...rest } = request.body;

      if (!name || !systemPrompt || !role) {
        return reply.status(400).send({ error: true, message: 'name, role, and systemPrompt are required' });
      }

      const agent = agentRepo.create({
        projectId,
        role,
        name,
        systemPrompt,
        ...rest,
        modelConfig: rest.modelConfig ?? { model: 'claude-sonnet-4-20250514', maxTokens: 8192, temperature: 0.7 },
      });

      invalidateMcpCache(projectId);
      return reply.status(201).send(agent);
    },
  );

  // Get agent by ID
  app.get<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const agent = agentRepo.findById(request.params.id);
    if (!agent) {
      return reply.status(404).send({ error: true, message: 'Agent not found' });
    }
    return reply.send(agent);
  });

  // Update agent
  app.patch<{ Params: { id: string }; Body: UpdateAgentInput }>('/api/agents/:id', async (request, reply) => {
    const agent = agentRepo.update(request.params.id, request.body);
    if (!agent) {
      return reply.status(404).send({ error: true, message: 'Agent not found' });
    }
    invalidateMcpCache(agent.projectId);
    return reply.send(agent);
  });

  // Get tasks for an agent
  app.get<{ Params: { id: string } }>('/api/agents/:id/tasks', async (request, reply) => {
    const tasks = taskRepo.findByAgentId(request.params.id);
    return reply.send(tasks);
  });

  // Get activities for an agent
  app.get<{ Params: { id: string } }>('/api/agents/:id/activities', async (request, reply) => {
    const activities = activityRepo.findByAgentId(request.params.id);
    return reply.send(activities);
  });

  // Delete agent
  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const existing = agentRepo.findById(request.params.id);
    const removed = agentRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Agent not found' });
    }
    if (existing) invalidateMcpCache(existing.projectId);
    return reply.status(204).send();
  });
}
