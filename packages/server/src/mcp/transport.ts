/**
 * MCP Transport — Fastify plugin, SSE üzerinden MCP bağlantısı sağlar
 *
 * Endpoint'ler:
 *   GET  /mcp/projects/:projectId  → SSE bağlantısı başlat
 *   POST /mcp/messages             → MCP mesajlarını ilet (sessionId query param gerekli)
 *   POST /mcp/cache/invalidate     → Cache'i manuel temizle
 *   GET  /health/mcp               → MCP sağlık durumu
 */
import type { FastifyInstance } from 'fastify';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer, invalidateMcpCache } from './server.js';
import { projectRepo } from '../db/repositories/project.repo.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mcp:transport');

// Aktif SSE transport'ları sessionId ile indekslenir
const activeTransports = new Map<string, SSEServerTransport>();

// Proje başına aktif session sayısı
const projectSessions = new Map<string, Set<string>>();

function addSession(projectId: string, sessionId: string): void {
  if (!projectSessions.has(projectId)) projectSessions.set(projectId, new Set());
  projectSessions.get(projectId)!.add(sessionId);
}

function removeSession(projectId: string, sessionId: string): void {
  projectSessions.get(projectId)?.delete(sessionId);
}

export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  // ── SSE bağlantısı ────────────────────────────────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/mcp/projects/:projectId',
    async (request, reply) => {
      const { projectId } = request.params;

      const project = projectRepo.findById(projectId);
      if (!project) {
        return reply.status(404).send({ error: true, message: 'Proje bulunamadı' });
      }

      // Fastify'ın response'a dokunmasını engelle
      reply.hijack();

      const transport = new SSEServerTransport('/mcp/messages', reply.raw);

      let mcpServer;
      try {
        mcpServer = createMcpServer(projectId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: true, message: msg }));
        return;
      }

      activeTransports.set(transport.sessionId, transport);
      addSession(projectId, transport.sessionId);
      log.info(`MCP session başladı — proje: ${project.name}, session: ${transport.sessionId}`);

      request.raw.on('close', () => {
        activeTransports.delete(transport.sessionId);
        removeSession(projectId, transport.sessionId);
        log.info(`MCP session kapandı — session: ${transport.sessionId}`);
      });

      await mcpServer.connect(transport);
    },
  );

  // ── MCP mesaj handler ─────────────────────────────────────────────────────
  app.post<{ Querystring: { sessionId?: string } }>(
    '/mcp/messages',
    async (request, reply) => {
      const { sessionId } = request.query;

      if (!sessionId) {
        return reply.status(400).send({
          error: true,
          message: 'sessionId query parametresi gerekli (örn: /mcp/messages?sessionId=xxx)',
        });
      }

      const transport = activeTransports.get(sessionId);
      if (!transport) {
        return reply.status(404).send({
          error: true,
          message: 'Geçersiz veya süresi dolmuş session. Lütfen yeniden SSE bağlantısı kurun.',
        });
      }

      reply.hijack();
      await transport.handlePostMessage(request.raw, reply.raw, request.body);
    },
  );

  // ── Cache invalidation ────────────────────────────────────────────────────
  app.post<{ Body: { projectId?: string } }>(
    '/mcp/cache/invalidate',
    async (request, reply) => {
      const { projectId } = request.body ?? {};
      if (projectId) {
        invalidateMcpCache(projectId);
      }
      return reply.send({ ok: true, invalidated: projectId ?? 'all' });
    },
  );

  // ── Per-project connection count ──────────────────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/mcp/projects/:projectId/connections',
    async (request, reply) => {
      const count = projectSessions.get(request.params.projectId)?.size ?? 0;
      return reply.send({ count });
    },
  );

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health/mcp', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      activeSessions: activeTransports.size,
      timestamp: new Date().toISOString(),
    });
  });
}
