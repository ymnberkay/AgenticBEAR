import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('db');

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  log.info(`Initializing database at: ${config.dbPath}`);

  db = new Database(config.dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run migrations
  runMigrations();

  log.info('Database initialized successfully');
  return db;
}

function runMigrations(): void {
  log.info('Running migrations...');

  // Create a migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationFiles = ['001_initial.sql'];

  const appliedStmt = db.prepare('SELECT name FROM _migrations WHERE name = ?');
  const insertStmt = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of migrationFiles) {
    const existing = appliedStmt.get(file);
    if (existing) {
      log.info(`Migration ${file} already applied, skipping`);
      continue;
    }

    const sqlPath = resolve(__dirname, 'migrations', file);
    const sql = readFileSync(sqlPath, 'utf-8');

    db.exec(sql);
    insertStmt.run(file);
    log.info(`Applied migration: ${file}`);
  }
}

export { db };
