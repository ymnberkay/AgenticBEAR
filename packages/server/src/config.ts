import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const defaultDbPath = resolve(homedir(), '.subagent-manager', 'data.db');

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  dbPath: process.env.DB_PATH ?? defaultDbPath,
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
};

// Ensure the database directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });
