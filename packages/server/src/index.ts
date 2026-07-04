import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { config } from './config.js';
import { initDb } from './db/client.js';
import { buildApp } from './app.js';
import { pullAllProjectIssues } from './services/issue-pull.service.js';
import { templateRepo } from './db/repositories/template.repo.js';
import { userRepo } from './db/repositories/user.repo.js';
import { BUILT_IN_TEMPLATES } from './seed-templates.js';
import { sessionManager } from './hub/session-manager.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Initialize database
  await initDb();

  // Seed built-in templates + first admin user. Hub/standalone only — with N session pods
  // sharing one Postgres, a single seeder avoids startup races.
  if (config.mode !== 'session') {
    await templateRepo.seedBuiltInTemplates(BUILT_IN_TEMPLATES);
    logger.info('Built-in templates seeded');

    if ((await userRepo.count()) === 0) {
      await userRepo.create({ username: config.auth.adminUsername, password: config.auth.adminPassword, role: 'admin' });
      logger.info(`Seeded admin user "${config.auth.adminUsername}" (change AUTH_ADMIN_PASSWORD in production)`);
    }
  }

  // Resolve client dist path for production static serving (session pods serve no UI)
  // Candidates ordered by likelihood:
  //   1. esbuild bundle: dist/server.js lives in dist/, so dist/public/ is a sibling
  //   2. tsc output: packages/server/dist/index.js → project root/dist/public/
  //   3. tsc fallback: packages/client/dist/
  let clientDist: string | undefined;
  if (config.isProduction && config.mode !== 'session') {
    const candidates = [
      resolve(__dirname, 'public'),
      resolve(__dirname, '../../../dist/public'),
      resolve(__dirname, '../../../packages/client/dist'),
    ];
    clientDist = candidates.find(p => existsSync(p));

    if (clientDist) {
      logger.info(`Serving UI from: ${clientDist}`);
    } else {
      logger.warn('Client build not found. Run `npm run build` first.');
    }
  }

  const app = await buildApp(clientDist);

  // Start server
  const portFile = resolve(homedir(), '.subagent-manager', 'port');
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Server listening on http://localhost:${config.port} (mode: ${config.mode})`);
    logger.info(`Database: ${config.dbDriver === 'postgres' ? 'postgres' : config.dbPath}`);
    // Port lockfile is a local-dev convenience (CLI launcher); meaningless in-cluster.
    if (config.mode === 'standalone') writeFileSync(portFile, String(config.port), 'utf8');
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }

  // ── Inbound issue-tracker polling ──
  // Pulls new/changed work items from every linked, sync-on tracker connection. Runs once
  // globally: hub (or standalone) only — the hub injects ISSUE_PULL_INTERVAL_MS=0 into session
  // pods as a second line of defense.
  // ISSUE_PULL_INTERVAL_MS: override interval (ms); set to 0 to disable polling entirely.
  const pullIntervalMs = (() => {
    if (config.mode === 'session') return 0;
    const raw = process.env.ISSUE_PULL_INTERVAL_MS;
    if (raw === undefined) return 5 * 60_000;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 5 * 60_000;
  })();
  let pullTimer: NodeJS.Timeout | undefined;
  if (pullIntervalMs > 0) {
    const tick = async () => {
      try {
        const r = await pullAllProjectIssues();
        if (r.imported || r.updated) logger.info(`issue-pull tick: ${r.imported} imported, ${r.updated} updated across ${r.pulled} links`);
      } catch (err) {
        logger.warn('issue-pull tick failed', err);
      }
    };
    // First tick shortly after boot so admins see fresh data without waiting a full interval.
    setTimeout(() => { void tick(); }, 15_000);
    pullTimer = setInterval(() => { void tick(); }, pullIntervalMs);
    logger.info(`issue-pull scheduler: every ${Math.round(pullIntervalMs / 1000)}s`);
  } else {
    logger.info('issue-pull scheduler: disabled');
  }

  // Hub: adopt existing session pods, then start the idle reaper.
  if (config.mode === 'hub') {
    await sessionManager.reconcile();
    sessionManager.startReaper();
  }

  // Graceful shutdown — session pods are NOT deleted on hub shutdown; a restarted hub re-adopts
  // them via reconcile, so rolling restarts don't kick active users.
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    if (pullTimer) clearInterval(pullTimer);
    if (config.mode === 'hub') sessionManager.stopReaper();
    if (config.mode === 'standalone') { try { rmSync(portFile); } catch {} }
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
