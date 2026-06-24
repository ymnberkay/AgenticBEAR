import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const defaultDbPath = resolve(homedir(), '.subagent-manager', 'data.db');

const port = parseInt(process.env.PORT ?? '3001', 10);
const isProduction = process.env.NODE_ENV === 'production';

/** 'sqlite' (default, zero-setup) or 'postgres' (set DATABASE_URL). */
const dbDriver = (process.env.DB_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'sqlite')) as 'sqlite' | 'postgres';

export const config = {
  port,
  isProduction,
  dbDriver,
  databaseUrl: process.env.DATABASE_URL ?? '',
  dbPath: process.env.DB_PATH ?? defaultDbPath,
  // In production the client is served from the same origin
  clientUrl: process.env.CLIENT_URL ?? (isProduction ? `http://localhost:${port}` : 'http://localhost:5173'),
  auth: {
    /** HMAC secret for session tokens. CHANGE in production (AUTH_SECRET). */
    secret: process.env.AUTH_SECRET ?? 'agenticbear-dev-secret-change-me',
    /** Seeded on first run when no users exist. */
    adminUsername: process.env.AUTH_ADMIN_USERNAME ?? 'admin',
    adminPassword: process.env.AUTH_ADMIN_PASSWORD ?? 'admin',
    tokenTtlHours: parseInt(process.env.AUTH_TOKEN_TTL_HOURS ?? '168', 10), // 7 gün
  },
};

// Ensure the database directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });
