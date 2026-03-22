import type { FastifyInstance, FastifyError } from 'fastify';
import { createLogger } from '../utils/logger.js';

const log = createLogger('error-handler');

export function registerErrorHandler(app: FastifyInstance): void {
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

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: true,
      statusCode: 404,
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
}
