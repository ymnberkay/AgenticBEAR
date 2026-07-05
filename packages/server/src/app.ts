/**
 * Fastify app assembly, split by deployment role (config.mode):
 *   standalone — everything in one process (local dev, single-pod deploy)
 *   hub        — control plane: auth/users, analytics, gateway /v1, MCP, SPA, session orchestration
 *   session    — one user's agentic runtime: projects, runs, chat/events SSE, workspace tools
 */
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { registerCors } from './plugins/cors.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { projectRoutes } from './routes/projects.js';
import { agentRoutes } from './routes/agents.js';
import { runRoutes } from './routes/runs.js';
import { templateRoutes } from './routes/templates.js';
import { settingsRoutes } from './routes/settings.js';
import { workspaceRoutes } from './routes/workspace.js';
import { eventRoutes } from './routes/events.js';
import { costRoutes } from './routes/cost.js';
import { providerRoutes } from './routes/providers.js';
import { gatewayRoutes } from './routes/gateway.js';
import { gatewayKeyRoutes } from './routes/gateway-keys.js';
import { documentRoutes } from './routes/documents.js';
import { chatRoutes } from './routes/chat.js';
import { fileChangeRoutes } from './routes/file-changes.js';
import { activityRoutes } from './routes/activity.js';
import { issueRoutes } from './routes/issues.js';
import { goalRoutes } from './routes/goals.js';
import { integrationRoutes } from './routes/integrations.js';
import { mcpRoutes } from './mcp/transport.js';
import { analyticsRoutes } from './routes/analytics.js';
import { authRoutes } from './routes/auth.js';
import { internalRoutes } from './routes/internal.js';
import { hubSessionRoutes } from './hub/routes.js';
import { authHook } from './middleware/require-auth.js';
import { rbacHook } from './middleware/rbac.js';

export async function buildApp(clientDist?: string): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use our own logger
    bodyLimit: config.bodyLimitMb * 1024 * 1024,
  });

  await registerCors(app);

  // Gate the app API (/api/*) behind a user session (gateway /v1 keeps its own API-key auth),
  // then enforce per-project RBAC for non-admins.
  app.addHook('onRequest', authHook);
  app.addHook('preHandler', rbacHook);

  const { mode } = config;

  // Control plane — login/user admin and the token-less surfaces (gateway API keys, MCP SSE).
  // MCP transports are sticky in-process maps; the hub runs a single replica so they just work.
  if (mode === 'hub' || mode === 'standalone') {
    await app.register(authRoutes);
    await app.register(gatewayRoutes);
    await app.register(gatewayKeyRoutes);
    await app.register(mcpRoutes);
  }

  // Agentic runtime — everything that touches projects, workspaces, or the execution engine.
  if (mode === 'session' || mode === 'standalone') {
    await app.register(projectRoutes);
    await app.register(agentRoutes);
    await app.register(runRoutes);
    await app.register(templateRoutes);
    await app.register(settingsRoutes);
    await app.register(workspaceRoutes);
    await app.register(eventRoutes);
    await app.register(costRoutes);
    await app.register(providerRoutes);
    await app.register(documentRoutes);
    await app.register(chatRoutes);
    await app.register(fileChangeRoutes);
    await app.register(activityRoutes);
    await app.register(issueRoutes);
    await app.register(goalRoutes);
    await app.register(integrationRoutes);
  }

  // Analytics reads shared Postgres — served everywhere so both hub (admin dashboards) and
  // session pods (client data plane) can answer it.
  await app.register(analyticsRoutes);

  if (mode === 'session') {
    await app.register(internalRoutes);
    // Key management UI hits the session base like the rest of the data plane; the /v1 gateway
    // itself stays on the hub. Auth/user CRUD is hub-only — the client routes /api/auth/* there.
    await app.register(gatewayKeyRoutes);
  }

  if (mode === 'hub') {
    await app.register(hubSessionRoutes);
  }

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Public runtime config — the client reads operator-set upload limits from here
  // (fed by env / Helm values) instead of compiling them into the bundle.
  app.get('/api/config', async () => {
    const u = config.uploads;
    return {
      uploads: {
        maxImageMb: u.maxImageMb, maxAudioMb: u.maxAudioMb, maxVideoMb: u.maxVideoMb,
        maxImages: u.maxImages, maxAudioClips: u.maxAudioClips, maxVideos: u.maxVideos,
      },
      bodyLimitMb: config.bodyLimitMb,
    };
  });

  // In production, serve built React client as static files (hub/standalone only)
  if (clientDist && mode !== 'session') {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      decorateReply: false,
    });
  }

  // Error handler + SPA fallback (must be registered after static plugin)
  registerErrorHandler(app, mode === 'session' ? undefined : clientDist);

  return app;
}
