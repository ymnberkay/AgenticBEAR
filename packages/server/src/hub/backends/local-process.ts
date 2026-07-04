/**
 * Local-process session backend (AGB_SESSION_BACKEND=process) — dev/testing without a cluster.
 * Each "session pod" is a child process of the hub on a free localhost port; the browser talks
 * to it directly via an absolute base URL (CORS is already registered server-side).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';
import { type SessionBackend, type SessionRecord, type SessionUser, sessionName, userHash } from './types.js';

const log = createLogger('hub:process');
const __dirname = dirname(fileURLToPath(import.meta.url));

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => res(port));
    });
    srv.on('error', rej);
  });
}

export class LocalProcessBackend implements SessionBackend {
  private children = new Map<string, { child: ChildProcess; record: SessionRecord }>();

  async start(user: SessionUser): Promise<SessionRecord> {
    const existing = this.children.get(user.id);
    if (existing && existing.child.exitCode === null) return existing.record;

    const port = await freePort();
    const baseUrl = `http://localhost:${port}`;
    const record: SessionRecord = {
      uid: user.id,
      username: user.username,
      name: sessionName(user),
      hash: userHash(user.id),
      internalUrl: baseUrl,
      publicBaseUrl: baseUrl,
    };

    // Bundled build if present (dist/server.js next to this file when esbuild-bundled,
    // or repo-root dist/), else the TS entry via tsx (dev).
    const bundled = [resolve(__dirname, '../../server.js'), resolve(__dirname, '../../../../../dist/server.js')].find(existsSync);
    const serverDir = resolve(__dirname, '../../..'); // packages/server (tsx layout)
    const [cmd, args, cwd] = bundled
      ? [process.execPath, [bundled], dirname(bundled)] as const
      : ['npx', ['tsx', 'src/index.ts'], serverDir] as const;

    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        AGB_MODE: 'session',
        AGB_SESSION_USER_ID: user.id,
        PORT: String(port),
        ISSUE_PULL_INTERVAL_MS: '0',
        DATABASE_URL: config.databaseUrl,
      },
    });
    child.on('exit', (code) => log.info(`Session process for ${user.username} exited (${code})`));
    this.children.set(user.id, { child, record });
    log.info(`Spawned session process for ${user.username} on :${port} (pid ${child.pid})`);
    return record;
  }

  async stop(record: SessionRecord): Promise<void> {
    const entry = this.children.get(record.uid);
    if (entry && entry.child.exitCode === null) entry.child.kill('SIGTERM');
    this.children.delete(record.uid);
  }

  async list(): Promise<SessionRecord[]> {
    return [...this.children.values()]
      .filter(({ child }) => child.exitCode === null)
      .map(({ record }) => record);
  }
}
