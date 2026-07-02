/**
 * Per-user monthly token consumption (personal budget). One row per (user, 'YYYY-MM').
 * Mirrors group-usage.repo — drives per-user quota enforcement. Upsert via ON CONFLICT
 * (supported identically by SQLite and Postgres; the adapter translates `?` → `$n`).
 */
import { getDb } from '../client.js';
import { currentPeriod } from './group-usage.repo.js';

export interface UserUsageRow {
  userId: string;
  period: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

interface Row {
  user_id: string;
  period: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  request_count: number;
}

function toRow(r: Row): UserUsageRow {
  return {
    userId: r.user_id,
    period: r.period,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    totalTokens: r.total_tokens,
    costUsd: r.cost_usd,
    requestCount: r.request_count,
  };
}

export const userUsageRepo = {
  async getPeriod(userId: string, period = currentPeriod()): Promise<UserUsageRow> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM user_token_usage WHERE user_id = ? AND period = ?')
      .get<Row>(userId, period);
    return row
      ? toRow(row)
      : { userId, period, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, requestCount: 0 };
  },

  /** All current-period rows keyed by user id (for a per-user usage dashboard). */
  async allForPeriod(period = currentPeriod()): Promise<Record<string, UserUsageRow>> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM user_token_usage WHERE period = ?').all<Row>(period);
    const out: Record<string, UserUsageRow> = {};
    for (const r of rows) out[r.user_id] = toRow(r);
    return out;
  },

  async increment(userId: string, inputTokens: number, outputTokens: number, costUsd: number): Promise<void> {
    const db = getDb();
    const period = currentPeriod();
    const total = inputTokens + outputTokens;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO user_token_usage (user_id, period, input_tokens, output_tokens, total_tokens, cost_usd, request_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT (user_id, period) DO UPDATE SET
        input_tokens = user_token_usage.input_tokens + EXCLUDED.input_tokens,
        output_tokens = user_token_usage.output_tokens + EXCLUDED.output_tokens,
        total_tokens = user_token_usage.total_tokens + EXCLUDED.total_tokens,
        cost_usd = user_token_usage.cost_usd + EXCLUDED.cost_usd,
        request_count = user_token_usage.request_count + 1,
        updated_at = EXCLUDED.updated_at
    `).run(userId, period, inputTokens, outputTokens, total, costUsd, now);
  },
};
