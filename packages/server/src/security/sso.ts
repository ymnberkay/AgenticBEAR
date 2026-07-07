/**
 * SSO providers (authorization-code flow, no external deps):
 *   entra  — Microsoft Entra ID, OIDC scoped to one tenant
 *   oidc   — any OIDC IdP (Okta / Keycloak / Auth0 / …) via issuer discovery
 *   github — plain OAuth2 (github.com or GitHub Enterprise), optional org gate
 *
 * Identity comes from the IdP's userinfo/user endpoint over TLS after a server-side code
 * exchange — no JWT validation surface. Claims map to { subject, email, displayName, username }.
 * The `state` param is an HMAC token only this server can mint (see auth-service.ts).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { SsoProviderId, SsoProviderInfo, User } from '@subagent/shared';
import { config } from '../config.js';
import { signSsoState } from './auth-service.js';
import { userRepo } from '../db/repositories/user.repo.js';
import { userIdentityRepo } from '../db/repositories/user-identity.repo.js';
import { groupRepo } from '../db/repositories/group.repo.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sso');

export interface SsoIdentity {
  provider: SsoProviderId;
  /** Stable IdP user id (OIDC `sub`, GitHub numeric id). */
  subject: string;
  email: string;
  displayName: string;
  /** Preferred local username (falls back to email, then subject). */
  username: string;
  /** IdP group memberships (OIDC groups claim / GitHub "org/team-slug") for group mapping. */
  groups: string[];
}

/** Thrown for user-visible sign-in failures (wrong org, provisioning off, …). */
export class SsoError extends Error {}

// ── Provider registry ──────────────────────────────────────────────────────────

export function enabledProviders(): SsoProviderInfo[] {
  const s = config.auth.sso;
  const out: SsoProviderInfo[] = [];
  if (s.entra.enabled) out.push({ id: 'entra', name: 'Microsoft Entra ID', startUrl: '/api/auth/sso/entra/start' });
  if (s.oidc.enabled) out.push({ id: 'oidc', name: s.oidc.displayName, startUrl: '/api/auth/sso/oidc/start' });
  if (s.github.enabled) out.push({ id: 'github', name: 'GitHub', startUrl: '/api/auth/sso/github/start' });
  return out;
}

export function isProviderEnabled(id: string): id is SsoProviderId {
  return enabledProviders().some((p) => p.id === id);
}

/** Redirect URI registered at the IdP: <publicUrl>/api/auth/sso/<id>/callback */
export function callbackUrl(provider: SsoProviderId, requestOrigin: string): string {
  const base = config.auth.sso.publicUrl || requestOrigin;
  return `${base}/api/auth/sso/${provider}/callback`;
}

// ── OIDC discovery (entra + generic share it) ──────────────────────────────────

interface OidcEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

const discoveryCache = new Map<string, { at: number; endpoints: OidcEndpoints }>();
const DISCOVERY_TTL_MS = 60 * 60_000;

function oidcIssuer(provider: 'entra' | 'oidc'): string {
  return provider === 'entra'
    ? `https://login.microsoftonline.com/${config.auth.sso.entra.tenantId}/v2.0`
    : config.auth.sso.oidc.issuer;
}

async function discover(provider: 'entra' | 'oidc'): Promise<OidcEndpoints> {
  const issuer = oidcIssuer(provider);
  const hit = discoveryCache.get(issuer);
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.endpoints;
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed for ${issuer}: HTTP ${res.status}`);
  const doc = (await res.json()) as Partial<OidcEndpoints>;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.userinfo_endpoint) {
    throw new Error(`OIDC discovery for ${issuer} is missing endpoints`);
  }
  const endpoints = doc as OidcEndpoints;
  discoveryCache.set(issuer, { at: Date.now(), endpoints });
  return endpoints;
}

function oidcClient(provider: 'entra' | 'oidc'): { clientId: string; clientSecret: string; scopes: string } {
  if (provider === 'entra') {
    const { clientId, clientSecret } = config.auth.sso.entra;
    return { clientId, clientSecret, scopes: 'openid profile email' };
  }
  const { clientId, clientSecret, scopes } = config.auth.sso.oidc;
  return { clientId, clientSecret, scopes };
}

// ── Authorize URL ──────────────────────────────────────────────────────────────

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** GitHub needs read:org for the org-membership gate and for team → group mapping. */
function githubScope(): string {
  const g = config.auth.sso.github;
  const needsOrg = !!g.org || Object.keys(config.auth.sso.groupMapping).length > 0;
  return needsOrg ? 'read:user user:email read:org' : 'read:user user:email';
}

/**
 * Start an SSO flow: authorize URL with a signed `state`. OIDC flows add PKCE (S256) — the
 * verifier travels sealed inside the state, so the callback can present it statelessly.
 */
export async function beginSso(provider: SsoProviderId, redirectUri: string): Promise<string> {
  if (provider === 'github') {
    const g = config.auth.sso.github;
    const base = g.baseUrl || 'https://github.com';
    const q = new URLSearchParams({
      client_id: g.clientId, redirect_uri: redirectUri, scope: githubScope(),
      state: signSsoState('github'), // GitHub OAuth apps ignore PKCE — skip it
    });
    return `${base}/login/oauth/authorize?${q}`;
  }
  const { authorization_endpoint } = await discover(provider);
  const { clientId, scopes } = oidcClient(provider);
  const verifier = b64url(randomBytes(32));
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    state: signSsoState(provider, verifier),
    nonce: randomBytes(16).toString('hex'),
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  });
  return `${authorization_endpoint}?${q}`;
}

// ── Code exchange + identity fetch ─────────────────────────────────────────────

/** Decode a JWT payload without verification — the token came straight from the IdP over TLS. */
function jwtPayload(jwt: string | undefined): Record<string, unknown> {
  const seg = jwt?.split('.')[1];
  if (!seg) return {};
  try {
    return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function claimGroups(claims: Record<string, unknown>): string[] {
  const raw = claims[config.auth.sso.groupsClaim];
  return Array.isArray(raw) ? raw.filter((g): g is string => typeof g === 'string') : [];
}

/**
 * Local username from an IdP handle: the part before '@', lowercased.
 * Usernames feed session-pod names (agb-session-<slug>) — a full email there would
 * produce agb-session-jane-doe-contoso-com; 'jane.doe' slugs cleanly.
 */
export function usernameFromHandle(handle: string): string {
  return handle.split('@')[0].toLowerCase();
}

async function exchangeOidc(provider: 'entra' | 'oidc', code: string, redirectUri: string, codeVerifier?: string): Promise<SsoIdentity> {
  const { token_endpoint, userinfo_endpoint } = await discover(provider);
  const { clientId, clientSecret } = oidcClient(provider);
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${provider} token exchange failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const tokens = (await res.json()) as { access_token?: string; id_token?: string };
  if (!tokens.access_token) throw new Error(`${provider} token exchange returned no access_token`);

  const uiRes = await fetch(userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!uiRes.ok) throw new Error(`${provider} userinfo failed: HTTP ${uiRes.status}`);
  // Groups often ride only in the id_token (Entra "groups" optional claim, Keycloak mappers) —
  // merge it under the userinfo claims, which win on conflicts.
  const claims = { ...jwtPayload(tokens.id_token), ...((await uiRes.json()) as Record<string, unknown>) } as {
    sub?: string; oid?: string; email?: string; preferred_username?: string; name?: string; upn?: string;
  } & Record<string, unknown>;
  if (!claims.sub) throw new Error(`${provider} userinfo returned no sub`);
  const email = claims.email ?? claims.preferred_username ?? claims.upn ?? '';
  return {
    provider,
    // Entra: `sub` is pairwise (per-app) but `oid` is the directory object id — the same id
    // the Graph API returns, which lets admins pre-link users added from the directory picker.
    subject: provider === 'entra' ? (claims.oid ?? claims.sub) : claims.sub,
    email,
    displayName: claims.name ?? '',
    username: usernameFromHandle(claims.preferred_username || email || claims.sub),
    groups: claimGroups(claims),
  };
}

async function exchangeGithub(code: string, redirectUri: string): Promise<SsoIdentity> {
  const g = config.auth.sso.github;
  const webBase = g.baseUrl || 'https://github.com';
  const apiBase = g.baseUrl ? `${g.baseUrl}/api/v3` : 'https://api.github.com';

  const res = await fetch(`${webBase}/login/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`github token exchange failed: HTTP ${res.status}`);
  const tokens = (await res.json()) as { access_token?: string; error_description?: string };
  if (!tokens.access_token) throw new Error(`github token exchange: ${tokens.error_description ?? 'no access_token'}`);
  const gh = { authorization: `Bearer ${tokens.access_token}`, accept: 'application/vnd.github+json' };

  const userRes = await fetch(`${apiBase}/user`, { headers: gh });
  if (!userRes.ok) throw new Error(`github /user failed: HTTP ${userRes.status}`);
  const u = (await userRes.json()) as { id: number; login: string; name?: string | null; email?: string | null };

  // Primary verified email is only in /user/emails when the profile email is private.
  let email = u.email ?? '';
  if (!email) {
    const emailRes = await fetch(`${apiBase}/user/emails`, { headers: gh });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as { email: string; primary: boolean; verified: boolean }[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? '';
    }
  }

  if (g.org) {
    // 'active' or 'pending' — only active members may sign in.
    const memRes = await fetch(`${apiBase}/user/memberships/orgs/${encodeURIComponent(g.org)}`, { headers: gh });
    const state = memRes.ok ? ((await memRes.json()) as { state?: string }).state : undefined;
    if (state !== 'active') throw new SsoError(`GitHub account is not an active member of the ${g.org} organization`);
  }

  // Teams → "org/team-slug" for group mapping (only when a mapping is configured).
  let groups: string[] = [];
  if (Object.keys(config.auth.sso.groupMapping).length > 0) {
    const teamRes = await fetch(`${apiBase}/user/teams?per_page=100`, { headers: gh });
    if (teamRes.ok) {
      const teams = (await teamRes.json()) as { slug: string; organization?: { login?: string } }[];
      groups = teams.map((t) => `${t.organization?.login ?? ''}/${t.slug}`);
    }
  }

  return {
    provider: 'github',
    subject: String(u.id),
    email,
    displayName: u.name ?? u.login,
    username: u.login.toLowerCase(),
    groups,
  };
}

export async function exchangeCode(provider: SsoProviderId, code: string, redirectUri: string, codeVerifier?: string): Promise<SsoIdentity> {
  return provider === 'github' ? exchangeGithub(code, redirectUri) : exchangeOidc(provider, code, redirectUri, codeVerifier);
}

// ── User resolution (link → auto-link → JIT provision) ────────────────────────

/** A unique local username for a fresh SSO user: base, base-2, base-3, … */
export async function freeUsername(base: string): Promise<string> {
  const clean = base.replace(/[^a-z0-9@._-]/gi, '').toLowerCase() || 'user';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? clean : `${clean}-${i + 1}`;
    if (!(await userRepo.findRowByUsername(candidate))) return candidate;
  }
  return `${clean}-${randomBytes(3).toString('hex')}`;
}

/**
 * IdP groups → AgenticBEAR permission groups. Only active when a mapping is configured;
 * then the IdP is the source of truth and the user's groups are REPLACED at every login.
 */
async function syncMappedGroups(user: User, idpGroups: string[]): Promise<User> {
  const mapping = config.auth.sso.groupMapping;
  if (Object.keys(mapping).length === 0) return user;

  const wantedNames = new Set(idpGroups.map((g) => mapping[g]).filter(Boolean));
  const all = await groupRepo.list();
  const ids = all.filter((g) => wantedNames.has(g.name)).map((g) => g.id);
  for (const name of wantedNames) {
    if (!all.some((g) => g.name === name)) log.warn(`SSO group mapping targets unknown permission group "${name}" — create it in Settings → Groups`);
  }
  const same = ids.length === user.groupIds.length && ids.every((id) => user.groupIds.includes(id));
  if (same) return user;
  log.info(`Syncing groups for ${user.username} from IdP: [${[...wantedNames].join(', ')}]`);
  return (await userRepo.update(user.id, { groupIds: ids })) ?? user;
}

/**
 * Map an IdP identity onto a local user:
 *   1. identity already linked → that user,
 *   2. autoLink: an existing username equals the IdP username/email → link it,
 *   3. autoProvision: create the user (SSO-only: random unusable password) → link it.
 * With a group mapping configured, permission groups are re-synced from the IdP every login.
 */
export async function resolveSsoUser(identity: SsoIdentity): Promise<User> {
  const linked = await userIdentityRepo.findByProviderSubject(identity.provider, identity.subject);
  if (linked) {
    userIdentityRepo.touch(linked.id, { email: identity.email, displayName: identity.displayName })
      .catch((err) => log.warn('identity touch failed', err));
    const user = await userRepo.findById(linked.userId);
    if (!user) throw new SsoError('Linked account no longer exists — contact your administrator');
    return syncMappedGroups(user, identity.groups);
  }

  const { autoLink, autoProvision, defaultRole } = config.auth.sso;

  if (autoLink) {
    for (const candidate of [identity.username, identity.email.toLowerCase()].filter(Boolean)) {
      const row = await userRepo.findRowByUsername(candidate);
      if (row) {
        await userIdentityRepo.link({
          userId: row.id, provider: identity.provider, subject: identity.subject,
          email: identity.email, displayName: identity.displayName,
        });
        log.info(`Linked ${identity.provider} identity to existing user ${row.username}`);
        return syncMappedGroups((await userRepo.findById(row.id))!, identity.groups);
      }
    }
  }

  if (!autoProvision) {
    throw new SsoError('No account for this identity — ask your administrator to create one');
  }

  const username = await freeUsername(identity.username || identity.email || `${identity.provider}-user`);
  const user = await userRepo.create({
    username,
    password: randomBytes(32).toString('hex'), // unusable — SSO users never see it
    role: defaultRole,
    email: identity.email,
  });
  await userIdentityRepo.link({
    userId: user.id, provider: identity.provider, subject: identity.subject,
    email: identity.email, displayName: identity.displayName,
  });
  log.info(`Provisioned ${identity.provider} user ${username} (role=${defaultRole})`);
  return syncMappedGroups(user, identity.groups);
}
