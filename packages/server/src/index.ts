import Fastify from 'fastify';
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
import { templateRepo } from './db/repositories/template.repo.js';
import { BUILT_IN_TEMPLATES } from './seed-templates.js';
import { logger } from './utils/logger.js';

async function main() {
  // Initialize database
  initDb();

  // Seed built-in templates
  templateRepo.seedBuiltInTemplates(BUILT_IN_TEMPLATES);
  logger.info('Built-in templates seeded');

  // Create Fastify instance
  const app = Fastify({
    logger: false, // We use our own logger
  });

  // Register plugins
  await registerCors(app);
  registerErrorHandler(app);

  // Register routes
  await app.register(projectRoutes);
  await app.register(agentRoutes);
  await app.register(runRoutes);
  await app.register(templateRoutes);
  await app.register(settingsRoutes);
  await app.register(workspaceRoutes);
  await app.register(eventRoutes);
  await app.register(mcpRoutes);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Start server
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Server listening on http://localhost:${config.port}`);
    logger.info(`Client URL: ${config.clientUrl}`);
    logger.info(`Database: ${config.dbPath}`);
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
