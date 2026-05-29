import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { config } from './config.js';
import { initDb } from './db/client.js';
import { registerCors } from './plugins/cors.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { projectRoutes } from './routes/projects.js';
import { agentRoutes } from './routes/agents.js';
import { runRoutes } from './routes/runs.js';
import { templateRoutes } from './routes/templates.js';
import { settingsRoutes } from './routes/settings.js';
import { workspaceRoutes } from './routes/workspace.js';
import { eventRoutes } from './routes/events.js';
import { mcpRoutes } from './mcp/transport.js';
import { analyticsRoutes } from './routes/analytics.js';
import { templateRepo } from './db/repositories/template.repo.js';
import { BUILT_IN_TEMPLATES } from './seed-templates.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Initialize database
  initDb();

  // Seed built-in templates
  templateRepo.seedBuiltInTemplates(BUILT_IN_TEMPLATES);
  logger.info('Built-in templates seeded');

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

  // Register routes
  await app.register(projectRoutes);
  await app.register(agentRoutes);
  await app.register(runRoutes);
  await app.register(templateRoutes);
  await app.register(settingsRoutes);
  await app.register(workspaceRoutes);
  await app.register(eventRoutes);
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

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    try { rmSync(portFile); } catch {}
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
