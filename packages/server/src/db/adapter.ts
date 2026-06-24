/**
 * Dual database adapter — one async surface, two backends.
 *
 *   • sqlite   (better-sqlite3, synchronous) — wrapped so calls return Promises
 *   • postgres (pg Pool, asynchronous)       — `?` placeholders auto-translated to `$1,$2,…`
 *
 * Repositories program against this async interface (`await db.prepare(sql).get(...)`),
 * so the same repo code runs on either backend. Driver is chosen in config (DB_DRIVER /
 * presence of DATABASE_URL); sqlite stays the zero-setup default.
 */
import Database from 'better-sqlite3';

export type DbDriver = 'sqlite' | 'postgres';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Stmt {
  get<T = any>(...params: unknown[]): Promise<T | undefined>;
  all<T = any>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<RunResult>;
}

export interface Db {
  readonly driver: DbDriver;
  prepare(sql: string): Stmt;
  /** Run one or more statements with no bind params (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// ── sqlite backend ───────────────────────────────────────────────────────────
export function createSqliteDb(path: string): Db {
  const sdb = new Database(path);
  sdb.pragma('journal_mode = WAL');
  sdb.pragma('foreign_keys = ON');
  sdb.pragma('busy_timeout = 5000');

  // better-sqlite3 binds `undefined` poorly; normalize to null like pg does.
  const norm = (params: unknown[]) => params.map((p) => (p === undefined ? null : p));

  return {
    driver: 'sqlite',
    prepare(sql: string): Stmt {
      const st = sdb.prepare(sql);
      return {
        async get<T>(...params: unknown[]) {
          return st.get(...norm(params)) as T | undefined;
        },
        async all<T>(...params: unknown[]) {
          return st.all(...norm(params)) as T[];
        },
        async run(...params: unknown[]) {
          const r = st.run(...norm(params));
          return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
        },
      };
    },
    async exec(sql: string) {
      sdb.exec(sql);
    },
    async close() {
      sdb.close();
    },
  };
}

// ── postgres backend ─────────────────────────────────────────────────────────
/** Replace `?` placeholders with positional `$1,$2,…` (our SQL uses `?` only as binds). */
function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function createPostgresDb(connectionString: string): Promise<Db> {
  // Lazy-load so sqlite installs don't pay for pg at import time.
  const pg = await import('pg');
  const { Pool, types } = pg.default ?? pg;
  // Make COUNT/bigint (oid 20) and numeric (oid 1700) come back as JS numbers,
  // matching better-sqlite3 (otherwise pg returns them as strings).
  types.setTypeParser(20, (v: string) => parseInt(v, 10));
  types.setTypeParser(1700, (v: string) => parseFloat(v));

  const pool = new Pool({ connectionString });
  // Surface connection errors instead of crashing the process.
  pool.on('error', (err: Error) => {
    // eslint-disable-next-line no-console
    console.error('[db] postgres pool error:', err.message);
  });

  return {
    driver: 'postgres',
    prepare(sql: string): Stmt {
      const text = toPgPlaceholders(sql);
      return {
        async get<T>(...params: unknown[]) {
          const r = await pool.query(text, params as unknown[]);
          return r.rows[0] as T | undefined;
        },
        async all<T>(...params: unknown[]) {
          const r = await pool.query(text, params as unknown[]);
          return r.rows as T[];
        },
        async run(...params: unknown[]) {
          const r = await pool.query(text, params as unknown[]);
          return { changes: r.rowCount ?? 0, lastInsertRowid: 0 };
        },
      };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}
