import 'dotenv/config';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const defaultDbPath = resolve(homedir(), '.subagent-manager', 'data.db');

const port = parseInt(process.env.PORT ?? '3001', 10);
const isProduction = process.env.NODE_ENV === 'production';

/** 'sqlite' (default, zero-setup) or 'postgres' (set DATABASE_URL). */
const dbDriver = (process.env.DB_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'sqlite')) as 'sqlite' | 'postgres';

/**
 * Deployment role (AGB_MODE):
 *   standalone — today's single process: API + UI + engine (default; local dev, single-pod deploy)
 *   hub        — control plane: auth, SPA, analytics, gateway/MCP, session-pod orchestration
 *   session    — one user's agentic runtime, created per user by the hub
 */
const mode = (process.env.AGB_MODE ?? 'standalone') as 'standalone' | 'hub' | 'session';

const intEnv = (name: string, fallback: number): number => {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

/** In-cluster namespace from the ServiceAccount mount, if present. */
function detectNamespace(): string {
  try {
    return readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8').trim();
  } catch {
    return 'default';
  }
}

export const config = {
  mode,
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
  /** Hub-mode settings: how session pods are created and routed. */
  hub: {
    /** 'kubernetes' in-cluster, 'process' spawns local child processes (dev, no cluster). */
    sessionBackend: (process.env.AGB_SESSION_BACKEND ?? 'kubernetes') as 'kubernetes' | 'process',
    namespace: process.env.AGB_NAMESPACE ?? detectNamespace(),
    /** Image for session pods; empty = hub's own image (must be set in k8s backend). */
    sessionImage: process.env.AGB_SESSION_IMAGE ?? '',
    sessionPort: intEnv('AGB_SESSION_PORT', 3001),
    /** Idle session pods older than this are reaped (never mid-run). */
    ttlSeconds: intEnv('AGB_SESSION_TTL_SECONDS', 1800),
    readyTimeoutSeconds: intEnv('AGB_SESSION_READY_TIMEOUT_SECONDS', 120),
    cpuRequest: process.env.AGB_SESSION_CPU_REQUEST ?? '250m',
    cpuLimit: process.env.AGB_SESSION_CPU_LIMIT ?? '1',
    memRequest: process.env.AGB_SESSION_MEM_REQUEST ?? '512Mi',
    memLimit: process.env.AGB_SESSION_MEM_LIMIT ?? '2Gi',
    /** envFrom refs injected into session pods (same ConfigMap/Secret the hub uses). */
    envFromConfigMap: process.env.AGB_SESSION_CONFIGMAP ?? '',
    envFromSecret: process.env.AGB_SESSION_SECRET ?? '',
    /**
     * Optional shared NFS for session workspaces. When both are set, /workspace in every
     * session pod is an NFS mount (subPath = username slug → <nfsPath>/<username>/ per user)
     * instead of emptyDir — git clones land there and survive pod reaps.
     */
    nfsServer: process.env.AGB_SESSION_NFS_SERVER ?? '',
    nfsPath: process.env.AGB_SESSION_NFS_PATH ?? '',
    ingressClass: process.env.AGB_INGRESS_CLASS ?? 'nginx',
    /** Public host the per-user Ingress rules attach to (e.g. agb.example.com). */
    publicHost: process.env.AGB_PUBLIC_HOST ?? '',
    /** Public path prefix for session pods: <basePrefix>/<user-hash>/... */
    basePrefix: process.env.AGB_SESSION_BASE_PREFIX ?? '/u',
  },
  /** Session-mode settings: the single user this pod serves. */
  session: {
    userId: process.env.AGB_SESSION_USER_ID ?? '',
  },
};

// Hub/session topology needs shared state and real secrets — refuse to boot half-configured.
if (mode !== 'standalone') {
  if (dbDriver !== 'postgres') {
    throw new Error(`AGB_MODE=${mode} requires Postgres: set DATABASE_URL (SQLite is single-pod only)`);
  }
  if (isProduction && !process.env.AUTH_SECRET) {
    throw new Error(`AGB_MODE=${mode} in production requires AUTH_SECRET (tokens must verify across pods)`);
  }
}
if (mode === 'session' && !config.session.userId) {
  throw new Error('AGB_MODE=session requires AGB_SESSION_USER_ID');
}

// Ensure the database directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });
