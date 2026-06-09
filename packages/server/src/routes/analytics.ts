import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/client.js';

interface AgentAnalyticsRow {
  agent_id: string;
  agent_name: string;
  agent_color: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  baseline_cost_usd: number;
  run_count: number;
}

interface DateAnalyticsRow {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  baseline_cost_usd: number;
}

interface RunTotalsRow {
  total_runs: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_baseline_cost_usd: number;
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/analytics',
    async (request, reply) => {
      const db = getDb();
      const { projectId } = request.params;

      // Project-level run totals.
      // Savings sadece baseline takibi olan run'lardan toplanır — eski run'larda baseline=0,
      // bu yüzden onları savings/baseline toplamlarına dahil etmek istemiyoruz (yoksa actual
      // > baseline gibi yanıltıcı bir tablo çıkar).
      const totals = db.prepare(`
        SELECT
          COUNT(*) AS total_runs,
          COALESCE(SUM(total_input_tokens), 0)  AS total_input_tokens,
          COALESCE(SUM(total_output_tokens), 0) AS total_output_tokens,
          COALESCE(SUM(total_cost_usd), 0)      AS total_cost_usd,
          COALESCE(SUM(CASE WHEN total_baseline_cost_usd > 0 THEN total_baseline_cost_usd ELSE 0 END), 0)
            AS total_baseline_cost_usd,
          COALESCE(SUM(CASE WHEN total_baseline_cost_usd > 0 THEN MAX(0, total_baseline_cost_usd - total_cost_usd) ELSE 0 END), 0)
            AS total_saved_usd
        FROM runs
        WHERE project_id = ?
      `).get(projectId) as RunTotalsRow & { total_saved_usd: number };

      // Per-agent breakdown (run_steps + agents). Aynı baseline > 0 filtresi.
      const byAgent = db.prepare(`
        SELECT
          rs.agent_id,
          a.name  AS agent_name,
          a.color AS agent_color,
          COALESCE(SUM(rs.input_tokens), 0)  AS input_tokens,
          COALESCE(SUM(rs.output_tokens), 0) AS output_tokens,
          COALESCE(SUM(rs.cost_usd), 0)      AS cost_usd,
          COALESCE(SUM(CASE WHEN rs.baseline_cost_usd > 0 THEN rs.baseline_cost_usd ELSE 0 END), 0)
            AS baseline_cost_usd,
          COALESCE(SUM(CASE WHEN rs.baseline_cost_usd > 0 THEN MAX(0, rs.baseline_cost_usd - rs.cost_usd) ELSE 0 END), 0)
            AS saved_usd,
          COUNT(DISTINCT rs.run_id)          AS run_count
        FROM run_steps rs
        JOIN agents a ON a.id = rs.agent_id
        WHERE a.project_id = ?
        GROUP BY rs.agent_id
        ORDER BY cost_usd DESC
      `).all(projectId) as (AgentAnalyticsRow & { saved_usd: number })[];

      // Daily breakdown — last 30 days
      const byDate = db.prepare(`
        SELECT
          date(rs.created_at) AS date,
          COALESCE(SUM(rs.input_tokens), 0)  AS input_tokens,
          COALESCE(SUM(rs.output_tokens), 0) AS output_tokens,
          COALESCE(SUM(rs.cost_usd), 0)      AS cost_usd,
          COALESCE(SUM(CASE WHEN rs.baseline_cost_usd > 0 THEN rs.baseline_cost_usd ELSE 0 END), 0)
            AS baseline_cost_usd,
          COALESCE(SUM(CASE WHEN rs.baseline_cost_usd > 0 THEN MAX(0, rs.baseline_cost_usd - rs.cost_usd) ELSE 0 END), 0)
            AS saved_usd
        FROM run_steps rs
        JOIN agents a ON a.id = rs.agent_id
        WHERE a.project_id = ?
          AND rs.created_at >= date('now', '-30 days')
        GROUP BY date(rs.created_at)
        ORDER BY date ASC
      `).all(projectId) as (DateAnalyticsRow & { saved_usd: number })[];

      const totalSavedUsd = totals.total_saved_usd;
      const savedPct = totals.total_baseline_cost_usd > 0
        ? (totalSavedUsd / totals.total_baseline_cost_usd) * 100
        : 0;

      return reply.send({
        totalRuns: totals.total_runs,
        totalInputTokens: totals.total_input_tokens,
        totalOutputTokens: totals.total_output_tokens,
        totalCostUsd: totals.total_cost_usd,
        totalBaselineCostUsd: totals.total_baseline_cost_usd,
        totalSavedUsd,
        savedPct,
        byAgent: byAgent.map((r) => ({
          agentId: r.agent_id,
          agentName: r.agent_name,
          agentColor: r.agent_color,
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
          costUsd: r.cost_usd,
          baselineCostUsd: r.baseline_cost_usd,
          savedUsd: r.saved_usd,
          runCount: r.run_count,
        })),
        byDate: byDate.map((r) => ({
          date: r.date,
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
          costUsd: r.cost_usd,
          baselineCostUsd: r.baseline_cost_usd,
          savedUsd: r.saved_usd,
        })),
      });
    },
  );
}
