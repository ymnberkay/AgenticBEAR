/**
 * One-shot data migration: copy every row from the local SQLite DB into Postgres.
 *
 * Prerequisites:
 *   - Postgres running and reachable via DATABASE_URL.
 *   - The SQLite file exists (default: config.dbPath, override with SQLITE_PATH).
 *
 * Usage (from repo root):
 *   DATABASE_URL=postgres://user:pass@localhost:5432/agenticbear \
 *     npx tsx packages/server/scripts/migrate-sqlite-to-postgres.ts
 *
 * Safe to re-run: every insert is `ON CONFLICT DO NOTHING`, so existing rows are skipped.
 * This script creates the Postgres schema first (runs the same migrations as the app).
 */
import 'dotenv/config';

// Force the app's DB layer to target Postgres for the destination connection.
process.env.DB_DRIVER = 'postgres';

const { config } = await import('../src/config.js');
const { initDb, getDb } = await import('../src/db/client.js');
const { createSqliteDb } = await import('../src/db/adapter.js');

if (!config.databaseUrl) {
  console.error('✗ DATABASE_URL is required (the Postgres destination).');
  process.exit(1);
}

const sqlitePath = process.env.SQLITE_PATH || config.dbPath;

// FK-safe order: parents before children.
const TABLES = [
  'projects',
  'agents',
  'llm_providers',
  'templates',
  'settings',
  'users',
  'permission_groups',
  'gateway_keys',
  'gateway_usage',
  'runs',
  'tasks',
  'run_steps',
  'file_changes',
  'agent_activities',
  'agent_memories',
  'project_documents',
] as const;

async function main() {
  console.log(`→ Source (SQLite):     ${sqlitePath}`);
  console.log(`→ Destination (PG):    ${config.databaseUrl.replace(/:[^:@/]+@/, ':****@')}`);

  // 1) Build the Postgres schema (runs the app's migrations against PG) + returns the PG adapter.
  const pg = await initDb();
  if (pg.driver !== 'postgres') throw new Error('Expected Postgres destination — check DB_DRIVER/DATABASE_URL');

  // 2) Open the SQLite source directly (read-only use).
  const sqlite = createSqliteDb(sqlitePath);

  let grandTotal = 0;
  for (const table of TABLES) {
    let rows: Record<string, unknown>[];
    try {
      rows = await sqlite.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
    } catch (err) {
      console.log(`  • ${table}: skipped (not in source: ${(err as Error).message})`);
      continue;
    }
    if (rows.length === 0) {
      console.log(`  • ${table}: 0 rows`);
      continue;
    }

    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    const stmt = pg.prepare(sql);

    let copied = 0;
    for (const row of rows) {
      const values = cols.map((c) => row[c]);
      const res = await stmt.run(...values);
      copied += res.changes;
    }
    grandTotal += copied;
    console.log(`  • ${table}: ${copied}/${rows.length} copied${copied < rows.length ? ' (rest already existed)' : ''}`);
  }

  await sqlite.close();
  await pg.close();
  console.log(`✓ Done. ${grandTotal} new row(s) migrated into Postgres.`);
}

main().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
