import type { FastifyInstance } from 'fastify';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { clearRateLimitCache } from '../services/rate-limiter.service.js';
import { lockCurationToCurrentCatalog } from './gateway.js';
import type { Settings, UpdateSettingsInput } from '@subagent/shared';

/** Short prefix…suffix mask so the client can show "a key is set" without ever seeing its value. */
function maskKey(key: string): string {
  return key ? `${key.slice(0, 10)}...${key.slice(-4)}` : '';
}

/**
 * Never send provider secrets to the client. Masks the Anthropic/OpenAI/Gemini keys and exposes
 * boolean `has*` flags for the UI's "configured" state.
 */
function maskSettings(settings: Settings) {
  return {
    ...settings,
    apiKey: maskKey(settings.apiKey),
    openAiApiKey: maskKey(settings.openAiApiKey),
    geminiApiKey: maskKey(settings.geminiApiKey),
    hasApiKey: !!settings.apiKey,
    hasOpenAiApiKey: !!settings.openAiApiKey,
    hasGeminiApiKey: !!settings.geminiApiKey,
  };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Get settings
  app.get('/api/settings', async (_request, reply) => {
    return reply.send(maskSettings(await settingsRepo.getSettings()));
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
    return reply.send(maskSettings(settings));
  });
}
