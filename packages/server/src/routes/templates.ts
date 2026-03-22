import type { FastifyInstance } from 'fastify';
import { templateRepo } from '../db/repositories/template.repo.js';
import type { CreateTemplateInput } from '@subagent/shared';

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  // List all templates
  app.get('/api/templates', async (_request, reply) => {
    const templates = templateRepo.findAll();
    return reply.send(templates);
  });

  // Create template
  app.post<{ Body: CreateTemplateInput }>('/api/templates', async (request, reply) => {
    const { name, category, description, systemPrompt } = request.body;

    if (!name || !category || !systemPrompt) {
      return reply.status(400).send({ error: true, message: 'name, category, and systemPrompt are required' });
    }

    const template = templateRepo.create(request.body);
    return reply.status(201).send(template);
  });

  // Update template
  app.patch<{ Params: { id: string }; Body: Partial<CreateTemplateInput> }>('/api/templates/:id', async (request, reply) => {
    const template = templateRepo.update(request.params.id, request.body);
    if (!template) {
      return reply.status(404).send({ error: true, message: 'Template not found' });
    }
    return reply.send(template);
  });

  // Delete template
  app.delete<{ Params: { id: string } }>('/api/templates/:id', async (request, reply) => {
    const removed = templateRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Template not found or is built-in' });
    }
    return reply.status(204).send();
  });
}
