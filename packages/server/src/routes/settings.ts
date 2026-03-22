import type { FastifyInstance } from 'fastify';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import type { UpdateSettingsInput } from '@subagent/shared';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Get settings
  app.get('/api/settings', async (_request, reply) => {
    const settings = settingsRepo.getSettings();
    // Mask the API key for security
    return reply.send({
      ...settings,
      apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 10)}...${settings.apiKey.slice(-4)}` : '',
      hasApiKey: !!settings.apiKey,
    });
  });

  // Update settings
  app.patch<{ Body: UpdateSettingsInput }>('/api/settings', async (request, reply) => {
    const settings = settingsRepo.updateSettings(request.body);
    return reply.send({
      ...settings,
      apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 10)}...${settings.apiKey.slice(-4)}` : '',
      hasApiKey: !!settings.apiKey,
    });
  });
}
