import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { getDb } from '../db/client.js';
import { modelPricing } from '../llm/provider-registry.js';

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

type Range = '1h' | '24h' | '7d' | '30d' | '90d' | 'all';
const RANGE_MS: Record<Exclude<Range, 'all'>, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
};

/** Resolve a time window from `range` preset or explicit from/to (custom range). */
function computeWindow(q: { range?: string; from?: string; to?: string }): { fromIso?: string; toIso?: string } {
  if (q.from || q.to) return { fromIso: q.from, toIso: q.to };
  const range = (q.range as Range) || '30d';
  if (range === 'all') return {};
  const span = RANGE_MS[range as Exclude<Range, 'all'>] ?? RANGE_MS['30d'];
  return { fromIso: new Date(Date.now() - span).toISOString(), toIso: new Date().toISOString() };
}

/** Build a format-safe time clause for a created_at column (handles both ' ' and 'T' timestamps). */
function timeClause(col: string, w: { fromIso?: string; toIso?: string }): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (w.fromIso) { parts.push(`datetime(${col}) >= datetime(?)`); params.push(w.fromIso); }
  if (w.toIso) { parts.push(`datetime(${col}) <= datetime(?)`); params.push(w.toIso); }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
}

type Window = { fromIso?: string; toIso?: string };

/**
 * Compute the analytics payload, scoped to a single project (`projectId`) or across the whole
 * organization (`projectId === null`). The SQL is identical apart from the optional project filter
 * + leading bind param, so both the per-project and global routes share one implementation.
 */
function queryAnalytics(db: Database.Database, window: Window, projectId: string | null) {
  const runsTime = timeClause('created_at', window);
  const stepsTime = timeClause('rs.created_at', window);
  const projRuns = projectId ? ' AND project_id = ?' : '';
  const projSteps = projectId ? ' AND a.project_id = ?' : '';
  const scope: string[] = projectId ? [projectId] : [];

  // Run totals. Savings only counted for runs that tracked a baseline (baseline=0 → legacy run);
  // including them would make actual > baseline look misleading.
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
    WHERE 1=1${projRuns}${runsTime.sql}
  `).get(...scope, ...runsTime.params) as RunTotalsRow & { total_saved_usd: number };

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
    WHERE 1=1${projSteps}${stepsTime.sql}
    GROUP BY rs.agent_id
    ORDER BY cost_usd DESC
  `).all(...scope, ...stepsTime.params) as (AgentAnalyticsRow & { saved_usd: number })[];

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
    WHERE 1=1${projSteps}${stepsTime.sql}
    GROUP BY date(rs.created_at)
    ORDER BY date ASC
  `).all(...scope, ...stepsTime.params) as (DateAnalyticsRow & { saved_usd: number })[];

  // Only LLM-call steps for layer/model/cache/router breakdowns.
  const callFilter = `rs.type IN ('api_call','reasoning')`;

  // Savings attributed to one layer per step (priority: L1 cache > L2 router > L3 prompt-cache).
  const layer = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN rs.cache_hit = 1 THEN MAX(0, rs.baseline_cost_usd - rs.cost_usd) ELSE 0 END), 0) AS l1,
      COALESCE(SUM(CASE WHEN rs.cache_hit = 0 AND rs.router_tier IN ('TRIVIAL','SIMPLE') THEN MAX(0, rs.baseline_cost_usd - rs.cost_usd) ELSE 0 END), 0) AS l2,
      COALESCE(SUM(CASE WHEN rs.cache_hit = 0 AND (rs.router_tier IS NULL OR rs.router_tier NOT IN ('TRIVIAL','SIMPLE')) AND rs.cache_read_tokens > 0 THEN MAX(0, rs.baseline_cost_usd - rs.cost_usd) ELSE 0 END), 0) AS l3
    FROM run_steps rs JOIN agents a ON a.id = rs.agent_id
    WHERE ${callFilter}${projSteps}${stepsTime.sql}
  `).get(...scope, ...stepsTime.params) as { l1: number; l2: number; l3: number };

  const cache = db.prepare(`
    SELECT COALESCE(SUM(rs.cache_hit), 0) AS hits, COUNT(*) AS total
    FROM run_steps rs JOIN agents a ON a.id = rs.agent_id
    WHERE ${callFilter}${projSteps}${stepsTime.sql}
  `).get(...scope, ...stepsTime.params) as { hits: number; total: number };

  const tierRows = db.prepare(`
    SELECT COALESCE(rs.router_tier, 'NONE') AS tier, COUNT(*) AS n
    FROM run_steps rs JOIN agents a ON a.id = rs.agent_id
    WHERE ${callFilter}${projSteps}${stepsTime.sql}
    GROUP BY tier
  `).all(...scope, ...stepsTime.params) as { tier: string; n: number }[];

  const modelRows = db.prepare(`
    SELECT COALESCE(rs.model, '(unknown)') AS model, COUNT(*) AS calls,
           COALESCE(SUM(rs.input_tokens),0) AS in_tok, COALESCE(SUM(rs.output_tokens),0) AS out_tok,
           COALESCE(SUM(rs.cost_usd),0) AS cost, COALESCE(SUM(rs.baseline_cost_usd),0) AS baseline
    FROM run_steps rs JOIN agents a ON a.id = rs.agent_id
    WHERE ${callFilter}${projSteps}${stepsTime.sql}
    GROUP BY rs.model ORDER BY cost DESC
  `).all(...scope, ...stepsTime.params) as { model: string; calls: number; in_tok: number; out_tok: number; cost: number; baseline: number }[];

  const mix = db.prepare(`
    SELECT COALESCE(SUM(rs.input_tokens),0) AS input, COALESCE(SUM(rs.output_tokens),0) AS output,
           COALESCE(SUM(rs.cache_read_tokens),0) AS cache_read, COALESCE(SUM(rs.cache_creation_tokens),0) AS cache_creation
    FROM run_steps rs JOIN agents a ON a.id = rs.agent_id
    WHERE 1=1${projSteps}${stepsTime.sql}
  `).get(...scope, ...stepsTime.params) as { input: number; output: number; cache_read: number; cache_creation: number };

  const recentRows = db.prepare(`
    SELECT rs.model, a.name AS agent_name, a.color AS agent_color, rs.input_tokens, rs.output_tokens,
           rs.cost_usd, rs.baseline_cost_usd, rs.cache_hit, rs.router_tier, rs.created_at
    FROM run_steps rs JOIN agents a ON a.id = rs.agent_id
    WHERE ${callFilter}${projSteps}${stepsTime.sql}
    ORDER BY rs.created_at DESC LIMIT 20
  `).all(...scope, ...stepsTime.params) as {
    model: string | null; agent_name: string; agent_color: string; input_tokens: number; output_tokens: number;
    cost_usd: number; baseline_cost_usd: number; cache_hit: number; router_tier: string | null; created_at: string;
  }[];

  // L0 context compression: saved input tokens per (model, provider) → priced into USD.
  // Compression shrinks the request before the call, so it is NOT in baseline−actual; we value
  // it separately as savedTokens × that model's input price.
  const compRows = db.prepare(`
    SELECT rs.model AS model, rs.provider_id AS provider_id, COALESCE(SUM(rs.compression_saved_tokens), 0) AS saved
    FROM run_steps rs JOIN agents a ON a.id = rs.agent_id
    WHERE 1=1${projSteps}${stepsTime.sql}
    GROUP BY rs.model, rs.provider_id
  `).all(...scope, ...stepsTime.params) as { model: string | null; provider_id: string | null; saved: number }[];

  let compressionSavedTokens = 0;
  let compressionSavedUsd = 0;
  for (const r of compRows) {
    if (!r.saved) continue;
    compressionSavedTokens += r.saved;
    if (r.model) compressionSavedUsd += (r.saved / 1000) * modelPricing(r.provider_id, r.model).costPer1kInput;
  }

  const totalSavedUsd = totals.total_saved_usd;
  const savedPct = totals.total_baseline_cost_usd > 0
    ? (totalSavedUsd / totals.total_baseline_cost_usd) * 100
    : 0;

  return {
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
    savingsByLayer: {
      compression: compressionSavedUsd,
      semanticCache: layer.l1,
      router: layer.l2,
      promptCache: layer.l3,
    },
    cache: {
      hits: cache.hits,
      misses: Math.max(0, cache.total - cache.hits),
      total: cache.total,
      hitRate: cache.total > 0 ? (cache.hits / cache.total) * 100 : 0,
    },
    routerTiers: tierRows.reduce<Record<string, number>>((acc, r) => { acc[r.tier] = r.n; return acc; }, {}),
    tokenMix: {
      input: mix.input,
      output: mix.output,
      cacheRead: mix.cache_read,
      cacheCreation: mix.cache_creation,
    },
    compressionSavedTokens,
    byModel: modelRows.map((r) => ({
      model: r.model,
      calls: r.calls,
      inputTokens: r.in_tok,
      outputTokens: r.out_tok,
      costUsd: r.cost,
      baselineCostUsd: r.baseline,
      savedUsd: Math.max(0, r.baseline - r.cost),
    })),
    recentCalls: recentRows.map((r) => ({
      model: r.model ?? '(unknown)',
      agentName: r.agent_name,
      agentColor: r.agent_color,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      baselineCostUsd: r.baseline_cost_usd,
      cacheHit: r.cache_hit === 1,
      routerTier: r.router_tier,
      createdAt: r.created_at,
    })),
  };
}

/** Per-project cost breakdown for the org-wide view (which projects spend/save the most). */
function queryByProject(db: Database.Database, window: Window) {
  const t = timeClause('r.created_at', window);
  const rows = db.prepare(`
    SELECT p.id AS project_id, p.name AS project_name,
      COALESCE(SUM(r.total_input_tokens), 0)  AS input_tokens,
      COALESCE(SUM(r.total_output_tokens), 0) AS output_tokens,
      COALESCE(SUM(r.total_cost_usd), 0)      AS cost_usd,
      COALESCE(SUM(CASE WHEN r.total_baseline_cost_usd > 0 THEN r.total_baseline_cost_usd ELSE 0 END), 0) AS baseline_cost_usd,
      COALESCE(SUM(CASE WHEN r.total_baseline_cost_usd > 0 THEN MAX(0, r.total_baseline_cost_usd - r.total_cost_usd) ELSE 0 END), 0) AS saved_usd,
      COUNT(r.id) AS run_count
    FROM projects p
    LEFT JOIN runs r ON r.project_id = p.id${t.sql}
    GROUP BY p.id
    HAVING run_count > 0
    ORDER BY cost_usd DESC
  `).all(...t.params) as {
    project_id: string; project_name: string; input_tokens: number; output_tokens: number;
    cost_usd: number; baseline_cost_usd: number; saved_usd: number; run_count: number;
  }[];
  return rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
    baselineCostUsd: r.baseline_cost_usd,
    savedUsd: r.saved_usd,
    runCount: r.run_count,
  }));
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string }; Querystring: { range?: string; from?: string; to?: string } }>(
    '/api/projects/:projectId/analytics',
    async (request, reply) => {
      const window = computeWindow(request.query);
      return reply.send(queryAnalytics(getDb(), window, request.params.projectId));
    },
  );

  // Org-wide analytics across every project (project run_steps only; gateway is reported
  // separately via /api/gateway-usage and combined in the client's Overview).
  app.get<{ Querystring: { range?: string; from?: string; to?: string } }>(
    '/api/analytics',
    async (request, reply) => {
      const db = getDb();
      const window = computeWindow(request.query);
      return reply.send({ ...queryAnalytics(db, window, null), byProject: queryByProject(db, window) });
    },
  );
}
