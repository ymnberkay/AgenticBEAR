import type { FastifyInstance } from 'fastify';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { clearRateLimitCache } from '../services/rate-limiter.service.js';
import { lockCurationToCurrentCatalog } from './gateway.js';
import type { UpdateSettingsInput } from '@subagent/shared';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Get settings
  app.get('/api/settings', async (_request, reply) => {
    const settings = await settingsRepo.getSettings();
    // Mask the API key for security
    return reply.send({
      ...settings,
      apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 10)}...${settings.apiKey.slice(-4)}` : '',
      hasApiKey: !!settings.apiKey,
    });
  });

  // Update settings
  app.patch<{ Body: UpdateSettingsInput }>('/api/settings', async (request, reply) => {
    const body = request.body ?? {};
    // Adding a built-in provider key (empty → set) for the first time switches to curation-first
    // exposure so the new provider's models start DISABLED until the admin enables them.
    const before = await settingsRepo.getSettings();
    const addsBuiltInKey =
      (!before.apiKey && !!body.apiKey) ||
      (!before.openAiApiKey && !!body.openAiApiKey) ||
      (!before.geminiApiKey && !!body.geminiApiKey);
    if (addsBuiltInKey) {
      await lockCurationToCurrentCatalog(); // snapshot pre-key catalog as the enabled set
    }

    const settings = await settingsRepo.updateSettings(body);
    clearRateLimitCache(); // model limits may have changed — refresh immediately
    return reply.send({
      ...settings,
      apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 10)}...${settings.apiKey.slice(-4)}` : '',
      hasApiKey: !!settings.apiKey,
    });
  });
}
