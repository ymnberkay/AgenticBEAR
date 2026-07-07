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

const boolEnv = (name: string, fallback: boolean): boolean => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'on';
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
  /** Max request body (MB). Base64 image/video attachments blow past Fastify's 1 MiB default. */
  bodyLimitMb: parseInt(process.env.BODY_LIMIT_MB ?? '64', 10),
  /**
   * Per-attachment upload limits — surfaced to the client via GET /api/config.
   * NOTE: base64 inflates a file ~1.34x, so a single attachment must satisfy
   * `maxVideoMb * 1.34 < bodyLimitMb`. Defaults keep a 40 MB video under the 64 MB body cap;
   * raise both together (MAX_VIDEO_MB + BODY_LIMIT_MB) for larger clips.
   */
  uploads: {
    maxImageMb: parseInt(process.env.MAX_IMAGE_MB ?? '20', 10),
    maxAudioMb: parseInt(process.env.MAX_AUDIO_MB ?? '25', 10),
    maxVideoMb: parseInt(process.env.MAX_VIDEO_MB ?? '40', 10),
    maxImages: parseInt(process.env.MAX_IMAGES ?? '4', 10),
    maxAudioClips: parseInt(process.env.MAX_AUDIO_CLIPS ?? '2', 10),
    maxVideos: parseInt(process.env.MAX_VIDEOS ?? '1', 10),
  },
  auth: {
    /** HMAC secret for session tokens. CHANGE in production (AUTH_SECRET). */
    secret: process.env.AUTH_SECRET ?? 'agenticbear-dev-secret-change-me',
    /** Seeded on first run when no users exist. */
    adminUsername: process.env.AUTH_ADMIN_USERNAME ?? 'admin',
    adminPassword: process.env.AUTH_ADMIN_PASSWORD ?? 'admin',
    tokenTtlHours: parseInt(process.env.AUTH_TOKEN_TTL_HOURS ?? '168', 10), // 7 gün
    local: {
      /** Username/password form. Disable when the org mandates SSO-only sign-in. */
      enabled: boolEnv('AUTH_LOCAL_ENABLED', true),
      /**
       * Break-glass: admins may still password-login while local auth is disabled, so a
       * misconfigured IdP can't lock the operator out. Turn off for strict SSO-only.
       */
      adminBreakGlass: boolEnv('AUTH_LOCAL_ADMIN_BREAK_GLASS', true),
    },
    /** TOTP enforcement for password logins: off | optional | required. SSO MFA is the IdP's job. */
    mfaMode: (['off', 'optional', 'required'].includes(process.env.AUTH_MFA_MODE ?? '')
      ? process.env.AUTH_MFA_MODE
      : 'off') as 'off' | 'optional' | 'required',
    /** Minimum length for local passwords (create, admin reset, self change). */
    passwordMinLength: intEnv('AUTH_PASSWORD_MIN_LENGTH', 8),
    /**
     * Require email verification for newly-added users. When enabled AND SMTP is configured,
     * created users start 'pending' and receive a confirmation link; they can't sign in until
     * they click it. Without SMTP configured this is ignored (users are created active).
     */
    requireEmailVerification: boolEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', false),
    sso: {
      /**
       * External base URL for OAuth redirect URIs (e.g. https://agb.example.com). Falls back to
       * the request origin when empty — set it whenever the app sits behind a proxy/ingress.
       */
      publicUrl: (process.env.AUTH_PUBLIC_URL ?? '').replace(/\/+$/, ''),
      /** Create users on first SSO login (JIT). false → only pre-created users may sign in. */
      autoProvision: boolEnv('AUTH_SSO_AUTO_PROVISION', true),
      /** Attach an SSO identity to an existing user whose username matches the IdP email/login. */
      autoLink: boolEnv('AUTH_SSO_AUTO_LINK', true),
      /** Role for JIT-provisioned users. */
      defaultRole: (['admin', 'contributor', 'viewer'].includes(process.env.AUTH_SSO_DEFAULT_ROLE ?? '')
        ? process.env.AUTH_SSO_DEFAULT_ROLE
        : 'contributor') as 'admin' | 'contributor' | 'viewer',
      /** Claim (id_token/userinfo) holding the user's IdP groups. */
      groupsClaim: process.env.AUTH_SSO_GROUPS_CLAIM ?? 'groups',
      /**
       * IdP group/team → AgenticBEAR permission-group NAME (JSON object). When non-empty, a
       * user's permission groups are replaced from this mapping at every SSO login (the IdP
       * becomes the source of truth). GitHub keys use "org/team-slug".
       */
      groupMapping: ((): Record<string, string> => {
        try {
          const parsed = JSON.parse(process.env.AUTH_SSO_GROUP_MAPPING ?? '{}') as Record<string, string>;
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          throw new Error('AUTH_SSO_GROUP_MAPPING must be a JSON object, e.g. {"idp-group":"Engineering"}');
        }
      })(),
      /** Microsoft Entra ID (Azure AD) — tenant-scoped OIDC. */
      entra: {
        enabled: boolEnv('AUTH_ENTRA_ENABLED', false),
        tenantId: process.env.AUTH_ENTRA_TENANT_ID ?? '',
        clientId: process.env.AUTH_ENTRA_CLIENT_ID ?? '',
        clientSecret: process.env.AUTH_ENTRA_CLIENT_SECRET ?? '',
      },
      /** Any OIDC-compliant IdP (Okta, Keycloak, Auth0, …) via issuer discovery. */
      oidc: {
        enabled: boolEnv('AUTH_OIDC_ENABLED', false),
        displayName: process.env.AUTH_OIDC_DISPLAY_NAME ?? 'SSO',
        issuer: (process.env.AUTH_OIDC_ISSUER ?? '').replace(/\/+$/, ''),
        clientId: process.env.AUTH_OIDC_CLIENT_ID ?? '',
        clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET ?? '',
        scopes: process.env.AUTH_OIDC_SCOPES ?? 'openid profile email',
      },
      /** GitHub OAuth — github.com by default, GitHub Enterprise via baseUrl. */
      github: {
        enabled: boolEnv('AUTH_GITHUB_ENABLED', false),
        clientId: process.env.AUTH_GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET ?? '',
        /** Restrict sign-in to members of this GitHub org ('' = any account). */
        org: process.env.AUTH_GITHUB_ORG ?? '',
        /** GitHub Enterprise Server base (e.g. https://github.corp.example) — empty = github.com. */
        baseUrl: (process.env.AUTH_GITHUB_BASE_URL ?? '').replace(/\/+$/, ''),
      },
    },
  },
  /** Outbound email (SMTP) — used for user verification links. Enabled when host+from are set. */
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: intEnv('SMTP_PORT', 587),
    /** true → implicit TLS (usually port 465); false → STARTTLS. */
    secure: boolEnv('SMTP_SECURE', false),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
    get enabled(): boolean { return !!(process.env.SMTP_HOST && (process.env.SMTP_FROM || process.env.SMTP_USER)); },
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

// Refuse a config with no way to sign in at all (SSO-only is fine; nothing enabled is not).
{
  const s = config.auth.sso;
  const anySso = s.entra.enabled || s.oidc.enabled || s.github.enabled;
  if (!config.auth.local.enabled && !anySso && mode !== 'session') {
    throw new Error('AUTH_LOCAL_ENABLED=false requires at least one SSO provider (Entra/OIDC/GitHub)');
  }
  if (s.entra.enabled && (!s.entra.tenantId || !s.entra.clientId || !s.entra.clientSecret)) {
    throw new Error('AUTH_ENTRA_ENABLED=true requires AUTH_ENTRA_TENANT_ID, AUTH_ENTRA_CLIENT_ID and AUTH_ENTRA_CLIENT_SECRET');
  }
  if (s.oidc.enabled && (!s.oidc.issuer || !s.oidc.clientId || !s.oidc.clientSecret)) {
    throw new Error('AUTH_OIDC_ENABLED=true requires AUTH_OIDC_ISSUER, AUTH_OIDC_CLIENT_ID and AUTH_OIDC_CLIENT_SECRET');
  }
  if (s.github.enabled && (!s.github.clientId || !s.github.clientSecret)) {
    throw new Error('AUTH_GITHUB_ENABLED=true requires AUTH_GITHUB_CLIENT_ID and AUTH_GITHUB_CLIENT_SECRET');
  }
  // Deriving redirect URIs from X-Forwarded-* is a host-header-injection risk in production —
  // require the operator to pin the external URL once SSO is live.
  if (anySso && isProduction && !s.publicUrl) {
    throw new Error('SSO in production requires AUTH_PUBLIC_URL (auth.sso.publicUrl in Helm) — redirect URIs must not be derived from request headers');
  }
}

// Ensure the database directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });
