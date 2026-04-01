import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const defaultDbPath = resolve(homedir(), '.subagent-manager', 'data.db');

const port = parseInt(process.env.PORT ?? '3001', 10);
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port,
  isProduction,
  dbPath: process.env.DB_PATH ?? defaultDbPath,
  // In production the client is served from the same origin
  clientUrl: process.env.CLIENT_URL ?? (isProduction ? `http://localhost:${port}` : 'http://localhost:5173'),
};

// Ensure the database directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });
