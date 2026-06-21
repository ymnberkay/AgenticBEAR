import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { GatewayUsageBucket, GatewayUsageSummary } from '@subagent/shared';

export interface RecordUsageInput {
  keyId: string | null;
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
  record(input: RecordUsageInput): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO gateway_usage
        (id, key_id, model, provider_id, input_tokens, output_tokens, cost_usd, baseline_usd, cache_hit, router_tier, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      input.keyId,
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

  summary(opts: { since?: string; keyId?: string; model?: string } = {}): GatewayUsageSummary {
    const db = getDb();
    const clauses: string[] = [];
    const args: string[] = [];
    if (opts.since) { clauses.push('created_at >= ?'); args.push(opts.since); }
    if (opts.keyId) { clauses.push(opts.keyId === '(none)' ? 'key_id IS NULL' : 'key_id = ?'); if (opts.keyId !== '(none)') args.push(opts.keyId); }
    if (opts.model) { clauses.push('model = ?'); args.push(opts.model); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const totals = db.prepare(`
      SELECT COUNT(*) AS requests,
             COALESCE(SUM(input_tokens),0)  AS input_tokens,
             COALESCE(SUM(output_tokens),0) AS output_tokens,
             COALESCE(SUM(cost_usd),0)      AS cost_usd,
             COALESCE(SUM(baseline_usd),0)  AS baseline_usd
      FROM gateway_usage ${where}
    `).get(...args) as Omit<AggRow, 'k'>;

    const groupBy = (col: string): GatewayUsageBucket[] => {
      const rows = db.prepare(`
        SELECT ${col} AS k, COUNT(*) AS requests,
               COALESCE(SUM(input_tokens),0)  AS input_tokens,
               COALESCE(SUM(output_tokens),0) AS output_tokens,
               COALESCE(SUM(cost_usd),0)      AS cost_usd,
               COALESCE(SUM(baseline_usd),0)  AS baseline_usd
        FROM gateway_usage ${where}
        GROUP BY ${col} ORDER BY cost_usd DESC
      `).all(...args) as AggRow[];
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
      byKey: groupBy('key_id'),
      byModel: groupBy('model'),
    };
  },
};
