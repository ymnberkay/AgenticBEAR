import type { FastifyInstance } from 'fastify';
import { providerRepo } from '../db/repositories/provider.repo.js';
import type { CreateProviderInput, LLMProvider, UpdateProviderInput } from '@subagent/shared';

/** Don't leak full API keys to the client. */
function maskProvider(p: LLMProvider): LLMProvider & { hasApiKey: boolean } {
  const apiKey = p.apiKey ?? '';
  return {
    ...p,
    apiKey: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : '',
    hasApiKey: !!apiKey,
  };
}

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/providers', async (_request, reply) => {
    return reply.send(providerRepo.findAll().map(maskProvider));
  });

  app.post<{ Body: CreateProviderInput }>('/api/providers', async (request, reply) => {
    const { label, kind } = request.body;
    if (!label || !kind) {
      return reply.status(400).send({ error: true, message: 'label and kind are required' });
    }
    const provider = providerRepo.create(request.body);
    return reply.status(201).send(maskProvider(provider));
  });

  app.patch<{ Params: { id: string }; Body: UpdateProviderInput }>('/api/providers/:id', async (request, reply) => {
    const provider = providerRepo.update(request.params.id, request.body);
    if (!provider) {
      return reply.status(404).send({ error: true, message: 'Provider not found' });
    }
    return reply.send(maskProvider(provider));
  });

  app.delete<{ Params: { id: string } }>('/api/providers/:id', async (request, reply) => {
    const removed = providerRepo.remove(request.params.id);
    if (!removed) {
      return reply.status(404).send({ error: true, message: 'Provider not found' });
    }
    return reply.status(204).send();
  });
}
