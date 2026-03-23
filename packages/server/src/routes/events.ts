import type { FastifyInstance } from 'fastify';
import { eventBus } from '../utils/event-bus.js';
import type { SSEEvent } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sse');

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // ── Project-level SSE (for MCP agent activity) ──────────────────────────
  app.get<{ Params: { projectId: string } }>('/api/events/project/:projectId', async (request, reply) => {
    const { projectId } = request.params;
    log.info(`Project SSE connection opened: ${projectId}`);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', projectId, timestamp: new Date().toISOString() })}\n\n`);

    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    const onEvent = (data: Record<string, unknown>) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // Connection closed
      }
    };

    eventBus.on(`project:${projectId}`, onEvent);

    request.raw.on('close', () => {
      log.info(`Project SSE connection closed: ${projectId}`);
      clearInterval(keepAlive);
      eventBus.off(`project:${projectId}`, onEvent);
    });

    return reply;
  });

  // ── Run-level SSE ──────────────────────────────────────────────────────
  app.get<{ Params: { runId: string } }>('/api/events/:runId', async (request, reply) => {
    const { runId } = request.params;

    log.info(`SSE connection opened for run: ${runId}`);

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connected event
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', runId, timestamp: new Date().toISOString() })}\n\n`);

    // Keep-alive interval
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    // Event handler
    const onEvent = (event: SSEEvent) => {
      try {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Connection might be closed
      }
    };

    // Listen for events for this run
    eventBus.on(`run:${runId}`, onEvent);

    // Cleanup on close
    request.raw.on('close', () => {
      log.info(`SSE connection closed for run: ${runId}`);
      clearInterval(keepAlive);
      eventBus.off(`run:${runId}`, onEvent);
    });

    // Don't let Fastify auto-send a response -- we're streaming
    // Return the raw reply to prevent Fastify from closing it
    return reply;
  });
}
