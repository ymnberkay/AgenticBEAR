/**
 * Per-group monthly token consumption (shared pool). One row per (group, 'YYYY-MM').
 * Drives quota enforcement + the by-group usage dashboard. Upsert via ON CONFLICT
 * (supported identically by SQLite and Postgres; the adapter translates `?` → `$n`).
 */
import { getDb } from '../client.js';

export interface GroupUsageRow {
  groupId: string;
  period: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

interface Row {
  group_id: string;
  period: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  request_count: number;
}

/** Current calendar-month period key, e.g. '2026-06'. */
export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toRow(r: Row): GroupUsageRow {
  return {
    groupId: r.group_id,
    period: r.period,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    totalTokens: r.total_tokens,
    costUsd: r.cost_usd,
    requestCount: r.request_count,
  };
}

export const groupUsageRepo = {
  async getPeriod(groupId: string, period = currentPeriod()): Promise<GroupUsageRow> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM group_token_usage WHERE group_id = ? AND period = ?')
      .get<Row>(groupId, period);
    return row
      ? toRow(row)
      : { groupId, period, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, requestCount: 0 };
  },

  /** All current-period rows keyed by group id (for the by-group dashboard). */
  async allForPeriod(period = currentPeriod()): Promise<Record<string, GroupUsageRow>> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM group_token_usage WHERE period = ?').all<Row>(period);
    const out: Record<string, GroupUsageRow> = {};
    for (const r of rows) out[r.group_id] = toRow(r);
    return out;
  },

  async increment(groupId: string, inputTokens: number, outputTokens: number, costUsd: number): Promise<void> {
    const db = getDb();
    const period = currentPeriod();
    const total = inputTokens + outputTokens;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO group_token_usage (group_id, period, input_tokens, output_tokens, total_tokens, cost_usd, request_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT (group_id, period) DO UPDATE SET
        input_tokens = group_token_usage.input_tokens + EXCLUDED.input_tokens,
        output_tokens = group_token_usage.output_tokens + EXCLUDED.output_tokens,
        total_tokens = group_token_usage.total_tokens + EXCLUDED.total_tokens,
        cost_usd = group_token_usage.cost_usd + EXCLUDED.cost_usd,
        request_count = group_token_usage.request_count + 1,
        updated_at = EXCLUDED.updated_at
    `).run(groupId, period, inputTokens, outputTokens, total, costUsd, now);
  },
};
