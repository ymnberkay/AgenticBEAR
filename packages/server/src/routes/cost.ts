import type { FastifyInstance } from 'fastify';
import { costMetrics } from '../cost/metrics.js';
import { costConfig } from '../cost/config.js';

/**
 * Cost-layer metrik raporu.
 *   GET    /api/cost-stats   → oturum toplamı + son N çağrı + aktif flag'ler
 *   DELETE /api/cost-stats   → metrikleri sıfırla (yeni ölçüm oturumu)
 */
export async function costRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/cost-stats', async (_request, reply) => {
    return reply.send({
      layers: costConfig.layers,
      ...costMetrics.getStats(),
    });
  });

  app.delete('/api/cost-stats', async (_request, reply) => {
    costMetrics.reset();
    return reply.send({ ok: true });
  });
}
