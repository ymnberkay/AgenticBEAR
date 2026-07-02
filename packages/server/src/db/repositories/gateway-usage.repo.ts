import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { GatewayUsageBucket, GatewayUsageDaily, GatewayUsageSummary, GatewayLatency } from '@subagent/shared';

/** A billable success ('ok') or a non-billable outcome we still want to observe. */
export type GatewayStatus = 'ok' | 'error' | 'rate_limited' | 'quota_exceeded' | 'model_not_allowed' | 'dlp_blocked';

export interface RecordUsageInput {
  keyId: string | null;
  groupId?: string | null;
  model: string;
  providerId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineUsd: number;
  cacheHit: boolean;
  routerTier: string | null;
  /** Wall-clock latency of the call in ms (null for rejections that never hit the provider). */
  latencyMs?: number | null;
  /** Request outcome. Defaults to 'ok' (billable success). */
  status?: GatewayStatus;
  /** Machine-readable error/rejection detail (e.g. 'timeout', 'upstream_5xx', 'quota'). */
  errorType?: string | null;
  /** L1 cache path when cacheHit: 'exact' | 'semantic' | 'judge'. */
  cacheKind?: string | null;
}

interface AggRow {
  k: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  baseline_usd: number;
}

export const gatewayUsageRepo = {
  async record(input: RecordUsageInput): Promise<void> {
    const db = getDb();
    await db.prepare(`
      INSERT INTO gateway_usage
        (id, key_id, group_id, model, provider_id, input_tokens, output_tokens, cost_usd, baseline_usd,
         cache_hit, router_tier, latency_ms, status, error_type, cache_kind, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      input.keyId,
      input.groupId ?? null,
      input.model,
      input.providerId,
      input.inputTokens,
      input.outputTokens,
      input.costUsd,
      input.baselineUsd,
      input.cacheHit ? 1 : 0,
      input.routerTier,
      input.latencyMs ?? null,
      input.status ?? 'ok',
      input.errorType ?? null,
      input.cacheKind ?? null,
      new Date().toISOString(),
    );
  },

  async summary(opts: { since?: string; keyId?: string; model?: string } = {}): Promise<GatewayUsageSummary> {
    const db = getDb();
    const clauses: string[] = [];
    const args: string[] = [];
    if (opts.since) { clauses.push('created_at >= ?'); args.push(opts.since); }
    if (opts.keyId) { clauses.push(opts.keyId === '(none)' ? 'key_id IS NULL' : 'key_id = ?'); if (opts.keyId !== '(none)') args.push(opts.keyId); }
    if (opts.model) { clauses.push('model = ?'); args.push(opts.model); }
    const base = clauses.length ? clauses.join(' AND ') : '';
    const allWhere = base ? `WHERE ${base}` : '';
    // Billable metrics only count successful ('ok') calls; rejections/errors have zero tokens/cost.
    const okWhere = `WHERE ${base ? `${base} AND ` : ''}status = 'ok'`;

    const totals = (await db.prepare(`
      SELECT COUNT(*) AS requests,
             COALESCE(SUM(input_tokens),0)  AS input_tokens,
             COALESCE(SUM(output_tokens),0) AS output_tokens,
             COALESCE(SUM(cost_usd),0)      AS cost_usd,
             COALESCE(SUM(baseline_usd),0)  AS baseline_usd,
             COALESCE(SUM(cache_hit),0)     AS cache_hits
      FROM gateway_usage ${okWhere}
    `).get<Omit<AggRow, 'k'> & { cache_hits: number }>(...args))!;

    // Status distribution across ALL attempts (ok + errors + rejections) — drives the error/limit panel.
    const statusRows = await db.prepare(`
      SELECT status AS k, COUNT(*) AS n FROM gateway_usage ${allWhere} GROUP BY status
    `).all<{ k: string; n: number }>(...args);
    const statusCounts: Record<string, number> = {};
    for (const r of statusRows) statusCounts[r.k || 'ok'] = r.n;
    const errorRequests = statusRows.filter((r) => r.k !== 'ok').reduce((s, r) => s + r.n, 0);

    // Latency percentiles over successful calls (cross-dialect: count + OFFSET, no percentile_cont).
    const latency = await this.latency(db, okWhere, args);

    // L1 cache path breakdown (exact/semantic/judge) over cache hits.
    const cacheKindRows = await db.prepare(`
      SELECT cache_kind AS k, COUNT(*) AS n FROM gateway_usage ${okWhere} AND cache_hit = 1 AND cache_kind IS NOT NULL GROUP BY cache_kind
    `).all<{ k: string; n: number }>(...args);
    const cacheKindCounts: Record<string, number> = { exact: 0, semantic: 0, judge: 0 };
    for (const r of cacheKindRows) cacheKindCounts[r.k] = r.n;

    // L2 router tier distribution ('(none)' = not routed / kept requested model).
    const tierRows = await db.prepare(`
      SELECT COALESCE(router_tier, '(none)') AS k, COUNT(*) AS n FROM gateway_usage ${okWhere} GROUP BY COALESCE(router_tier, '(none)')
    `).all<{ k: string; n: number }>(...args);
    const routerTierCounts: Record<string, number> = {};
    for (const r of tierRows) routerTierCounts[r.k] = r.n;

    // Daily buckets: billable requests + error counts side by side (substr of ISO ts is portable).
    const dateRows = await db.prepare(`
      SELECT substr(created_at, 1, 10) AS d,
             SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END)  AS requests,
             SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors,
             COALESCE(SUM(input_tokens),0)  AS input_tokens,
             COALESCE(SUM(output_tokens),0) AS output_tokens,
             COALESCE(SUM(cost_usd),0)      AS cost_usd,
             COALESCE(SUM(baseline_usd),0)  AS baseline_usd,
             COALESCE(SUM(cache_hit),0)     AS cache_hits
      FROM gateway_usage ${allWhere}
      GROUP BY substr(created_at, 1, 10) ORDER BY d ASC
    `).all<{ d: string; requests: number; errors: number; input_tokens: number; output_tokens: number; cost_usd: number; baseline_usd: number; cache_hits: number }>(...args);
    const byDate: GatewayUsageDaily[] = dateRows.map((r) => ({
      date: r.d,
      requests: r.requests,
      errors: r.errors,
      cacheHits: r.cache_hits,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      baselineCostUsd: r.baseline_usd,
      savedUsd: r.baseline_usd - r.cost_usd,
    }));

    const groupBy = async (col: string): Promise<GatewayUsageBucket[]> => {
      const rows = await db.prepare(`
        SELECT ${col} AS k, COUNT(*) AS requests,
               COALESCE(SUM(input_tokens),0)  AS input_tokens,
               COALESCE(SUM(output_tokens),0) AS output_tokens,
               COALESCE(SUM(cost_usd),0)      AS cost_usd,
               COALESCE(SUM(baseline_usd),0)  AS baseline_usd
        FROM gateway_usage ${okWhere}
        GROUP BY ${col} ORDER BY cost_usd DESC
      `).all<AggRow>(...args);
      return rows.map((r) => ({
        key: r.k ?? '(none)',
        label: r.k ?? '(open / no key)',
        requests: r.requests,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        costUsd: r.cost_usd,
        baselineUsd: r.baseline_usd,
      }));
    };

    return {
      totalRequests: totals.requests,
      totalInputTokens: totals.input_tokens,
      totalOutputTokens: totals.output_tokens,
      totalCostUsd: totals.cost_usd,
      totalBaselineUsd: totals.baseline_usd,
      savedUsd: totals.baseline_usd - totals.cost_usd,
      cacheHits: totals.cache_hits,
      errorRequests,
      statusCounts,
      latency,
      cacheKindCounts,
      routerTierCounts,
      byKey: await groupBy('key_id'),
      byModel: await groupBy('model'),
      byGroup: await groupBy('group_id'),
      byDate,
    };
  },

  /** p50/p95/p99 + avg latency (ms) over successful calls. Cross-dialect via COUNT + OFFSET. */
  async latency(db: ReturnType<typeof getDb>, okWhere: string, args: string[]): Promise<GatewayLatency | null> {
    const latWhere = `${okWhere} AND latency_ms IS NOT NULL`;
    const cnt = (await db.prepare(`SELECT COUNT(*) AS n, COALESCE(AVG(latency_ms),0) AS avg FROM gateway_usage ${latWhere}`)
      .get<{ n: number; avg: number }>(...args))!;
    if (cnt.n === 0) return null;
    const at = async (p: number): Promise<number> => {
      const offset = Math.min(cnt.n - 1, Math.floor(cnt.n * p));
      const row = await db.prepare(`SELECT latency_ms AS v FROM gateway_usage ${latWhere} ORDER BY latency_ms ASC LIMIT 1 OFFSET ${offset}`)
        .get<{ v: number }>(...args);
      return row?.v ?? 0;
    };
    return { p50: await at(0.5), p95: await at(0.95), p99: await at(0.99), avg: Math.round(cnt.avg), count: cnt.n };
  },
};
