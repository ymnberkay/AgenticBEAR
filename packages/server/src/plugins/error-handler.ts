import type { FastifyInstance, FastifyError } from 'fastify';
import { createLogger } from '../utils/logger.js';

const log = createLogger('error-handler');

export function registerErrorHandler(app: FastifyInstance, spaRoot?: string): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    log.error(`${request.method} ${request.url} - ${error.message}`, error);

    const statusCode = error.statusCode ?? 500;
    const response = {
      error: true,
      statusCode,
      message: error.message,
      ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }),
    };

    reply.status(statusCode).send(response);
  });

  app.setNotFoundHandler(async (request, reply) => {
    // In production with a SPA root, serve index.html for non-API routes
    if (spaRoot && !request.url.startsWith('/api') && !request.url.startsWith('/mcp')) {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const html = readFileSync(resolve(spaRoot, 'index.html'), 'utf-8');
      return reply.type('text/html').send(html);
    }
    reply.status(404).send({
      error: true,
      statusCode: 404,
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
}
