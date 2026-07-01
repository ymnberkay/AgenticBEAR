import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { config } from './config.js';
import { initDb } from './db/client.js';
import { pullAllProjectIssues } from './services/issue-pull.service.js';
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
import { authHook } from './middleware/require-auth.js';
import { rbacHook } from './middleware/rbac.js';
import { templateRepo } from './db/repositories/template.repo.js';
import { userRepo } from './db/repositories/user.repo.js';
import { BUILT_IN_TEMPLATES } from './seed-templates.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Initialize database
  await initDb();

  // Seed built-in templates
  await templateRepo.seedBuiltInTemplates(BUILT_IN_TEMPLATES);
  logger.info('Built-in templates seeded');

  // Seed the first admin user if none exist (login gate bootstrap).
  if ((await userRepo.count()) === 0) {
    await userRepo.create({ username: config.auth.adminUsername, password: config.auth.adminPassword, role: 'admin' });
    logger.info(`Seeded admin user "${config.auth.adminUsername}" (change AUTH_ADMIN_PASSWORD in production)`);
  }

  // Resolve client dist path for production static serving
  // Candidates ordered by likelihood:
  //   1. esbuild bundle: dist/server.js lives in dist/, so dist/public/ is a sibling
  //   2. tsc output: packages/server/dist/index.js → project root/dist/public/
  //   3. tsc fallback: packages/client/dist/
  let clientDist: string | undefined;
  if (config.isProduction) {
    const candidates = [
      resolve(__dirname, 'public'),
      resolve(__dirname, '../../../dist/public'),
      resolve(__dirname, '../../../packages/client/dist'),
    ];
    clientDist = candidates.find(p => existsSync(p));

    if (clientDist) {
      logger.info(`Serving UI from: ${clientDist}`);
    } else {
      logger.warn('Client build not found. Run `npm run build` first.');
    }
  }

  // Create Fastify instance
  const app = Fastify({
    logger: false, // We use our own logger
  });

  // Register plugins
  await registerCors(app);

  // Gate the app API (/api/*) behind a user session (gateway /v1 keeps its own API-key auth),
  // then enforce per-project RBAC for non-admins.
  app.addHook('onRequest', authHook);
  app.addHook('preHandler', rbacHook);

  // Register routes
  await app.register(authRoutes);
  await app.register(projectRoutes);
  await app.register(agentRoutes);
  await app.register(runRoutes);
  await app.register(templateRoutes);
  await app.register(settingsRoutes);
  await app.register(workspaceRoutes);
  await app.register(eventRoutes);
  await app.register(costRoutes);
  await app.register(providerRoutes);
  await app.register(gatewayRoutes);
  await app.register(gatewayKeyRoutes);
  await app.register(documentRoutes);
  await app.register(chatRoutes);
  await app.register(fileChangeRoutes);
  await app.register(activityRoutes);
  await app.register(issueRoutes);
  await app.register(goalRoutes);
  await app.register(integrationRoutes);
  await app.register(mcpRoutes);
  await app.register(analyticsRoutes);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // In production, serve built React client as static files
  if (clientDist) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      decorateReply: false,
    });
  }

  // Error handler + SPA fallback (must be registered after static plugin)
  registerErrorHandler(app, clientDist);

  // Start server
  const portFile = resolve(homedir(), '.subagent-manager', 'port');
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Server listening on http://localhost:${config.port}`);
    logger.info(`Client URL: ${config.clientUrl}`);
    logger.info(`Database: ${config.dbPath}`);
    writeFileSync(portFile, String(config.port), 'utf8');
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }

  // ── Inbound issue-tracker polling ──
  // Pulls new/changed work items from every linked, sync-on tracker connection.
  // ISSUE_PULL_INTERVAL_MS: override interval (ms); set to 0 to disable polling entirely.
  const pullIntervalMs = (() => {
    const raw = process.env.ISSUE_PULL_INTERVAL_MS;
    if (raw === undefined) return 5 * 60_000;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 5 * 60_000;
  })();
  let pullTimer: NodeJS.Timeout | undefined;
  if (pullIntervalMs > 0) {
    const tick = async () => {
      try {
        const r = await pullAllProjectIssues();
        if (r.imported || r.updated) logger.info(`issue-pull tick: ${r.imported} imported, ${r.updated} updated across ${r.pulled} links`);
      } catch (err) {
        logger.warn('issue-pull tick failed', err);
      }
    };
    // First tick shortly after boot so admins see fresh data without waiting a full interval.
    setTimeout(() => { void tick(); }, 15_000);
    pullTimer = setInterval(() => { void tick(); }, pullIntervalMs);
    logger.info(`issue-pull scheduler: every ${Math.round(pullIntervalMs / 1000)}s`);
  } else {
    logger.info('issue-pull scheduler: disabled (ISSUE_PULL_INTERVAL_MS=0)');
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    if (pullTimer) clearInterval(pullTimer);
    try { rmSync(portFile); } catch {}
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
