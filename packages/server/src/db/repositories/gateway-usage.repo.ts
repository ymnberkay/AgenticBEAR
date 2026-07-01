import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { GatewayUsageBucket, GatewayUsageDaily, GatewayUsageSummary } from '@subagent/shared';

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
        (id, key_id, group_id, model, provider_id, input_tokens, output_tokens, cost_usd, baseline_usd, cache_hit, router_tier, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const totals = (await db.prepare(`
      SELECT COUNT(*) AS requests,
             COALESCE(SUM(input_tokens),0)  AS input_tokens,
             COALESCE(SUM(output_tokens),0) AS output_tokens,
             COALESCE(SUM(cost_usd),0)      AS cost_usd,
             COALESCE(SUM(baseline_usd),0)  AS baseline_usd,
             COALESCE(SUM(cache_hit),0)     AS cache_hits
      FROM gateway_usage ${where}
    `).get<Omit<AggRow, 'k'> & { cache_hits: number }>(...args))!;

    // Daily buckets (ascending) for the over-time chart. substr() of the ISO timestamp works in
    // both SQLite and Postgres.
    const dateRows = await db.prepare(`
      SELECT substr(created_at, 1, 10) AS d,
             COUNT(*)                       AS requests,
             COALESCE(SUM(input_tokens),0)  AS input_tokens,
             COALESCE(SUM(output_tokens),0) AS output_tokens,
             COALESCE(SUM(cost_usd),0)      AS cost_usd,
             COALESCE(SUM(baseline_usd),0)  AS baseline_usd,
             COALESCE(SUM(cache_hit),0)     AS cache_hits
      FROM gateway_usage ${where}
      GROUP BY substr(created_at, 1, 10) ORDER BY d ASC
    `).all<{ d: string; requests: number; input_tokens: number; output_tokens: number; cost_usd: number; baseline_usd: number; cache_hits: number }>(...args);
    const byDate: GatewayUsageDaily[] = dateRows.map((r) => ({
      date: r.d,
      requests: r.requests,
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
        FROM gateway_usage ${where}
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
      byKey: await groupBy('key_id'),
      byModel: await groupBy('model'),
      byDate,
    };
  },

  /** Total USD spent by a key in the current calendar month — drives per-key budget enforcement. */
  async monthCostForKey(keyId: string): Promise<number> {
    const db = getDb();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const row = await db.prepare(
      'SELECT COALESCE(SUM(cost_usd),0) AS c FROM gateway_usage WHERE key_id = ? AND created_at >= ?',
    ).get<{ c: number }>(keyId, monthStart);
    return row?.c ?? 0;
  },
};
