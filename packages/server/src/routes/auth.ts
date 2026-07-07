/**
 * Auth + user management.
 *   GET    /api/auth/methods      → enabled login methods (public; drives the login screen)
 *   POST   /api/auth/login        { username, password } → { token, user } | MFA challenge (public)
 *   GET    /api/auth/sso/:provider/start     → 302 to the IdP                    (public)
 *   GET    /api/auth/sso/:provider/callback  → exchange code, redirect with token (public)
 *   POST   /api/auth/mfa/verify   { mfaToken, code } → { token, user }           (public)
 *   POST   /api/auth/password     { currentPassword, newPassword } → fresh token (authed)
 *   POST   /api/auth/mfa/setup    → { secret, otpauthUrl }   (authed, pending until /enable)
 *   POST   /api/auth/mfa/enable   { code } → confirms enrollment
 *   POST   /api/auth/mfa/disable  { code } → removes enrollment
 *   GET    /api/auth/me           → current user
 *   GET    /api/auth/users        → list (admin)
 *   POST   /api/auth/users        → create (admin)
 *   PATCH  /api/auth/users/:id    → role/groups/password/resetMfa (admin)
 *   DELETE /api/auth/users/:id    → remove (admin)
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AddEntraUserInput, AuthMethodsInfo, AuthResult, Capability, ChangePasswordInput, CreateRoleInput, CreateUserInput, GroupUsage, LoginInput, MfaVerifyInput, SessionInfo, UpdateRoleInput, UpdateUserInput, User, UserRole, UserUsage } from '@subagent/shared';
import { ALL_CAPABILITIES } from '@subagent/shared';
import { userRepo, type UserRow } from '../db/repositories/user.repo.js';
import { roleRepo } from '../db/repositories/role.repo.js';
import { clearRoleCache } from '../security/capabilities.js';
import { userIdentityRepo } from '../db/repositories/user-identity.repo.js';
import { userUsageRepo } from '../db/repositories/user-usage.repo.js';
import { groupRepo } from '../db/repositories/group.repo.js';
import { groupUsageRepo, currentPeriod } from '../db/repositories/group-usage.repo.js';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';
import { verifyPassword, signToken, signMfaToken, verifyMfaToken, verifySsoState } from '../security/auth-service.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../security/totp.js';
import { randomBytes } from 'node:crypto';
import { beginSso, callbackUrl, exchangeCode, enabledProviders, freeUsername, isProviderEnabled, resolveSsoUser, usernameFromHandle, SsoError } from '../security/sso.js';
import { searchEntraUsers } from '../security/entra-directory.js';
import { clearLoginFailures, clearMfaFailures, loginRetryAfter, mfaRetryAfter, recordLoginFailure, recordMfaFailure } from '../security/login-throttle.js';
import { isEmailEnabled, sendVerificationEmail } from '../security/email.js';
import { type AuthedRequest, requireAdmin } from '../middleware/require-auth.js';
import { config } from '../config.js';
import { sessionManager } from '../hub/session-manager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth');

/** Best-effort audit trail (Settings → project Activity readers pick these up). */
function audit(action: string, user: { id?: string; username?: string } | null, detail = ''): void {
  activityLogRepo.record({ userId: user?.id ?? null, username: user?.username ?? '', action, detail })
    .catch((err) => log.warn(`audit(${action}) failed`, err));
}

/**
 * Verify + burn a TOTP code against the user row. The accepted counter is persisted
 * atomically (UPDATE … WHERE totp_last_counter < ?), so a code can't be replayed within
 * its window — across restarts and replicas.
 */
async function consumeTotp(row: UserRow, code: string): Promise<boolean> {
  const secret = userRepo.totpSecretOf(row);
  const counter = secret ? verifyTotp(secret, code) : null;
  if (counter === null) return false;
  return userRepo.consumeTotpCounter(row.id, counter);
}

/** Session token + (hub) warmed session pod — shared by password, MFA and SSO logins. */
async function issueSession(user: User): Promise<AuthResult> {
  let session: SessionInfo = { status: 'ready', baseUrl: '' };
  if (config.mode === 'hub') {
    sessionManager.ensureSession({ id: user.id, username: user.username }).catch((err) => log.warn(`ensureSession(${user.username}) failed`, err));
    session = sessionManager.getStatus(user.id);
  }
  const tokenVersion = (await userRepo.findForAuth(user.id))?.tokenVersion ?? 0;
  return { token: signToken(user.id, tokenVersion), user, session };
}

/** External origin for OAuth redirect URIs when AUTH_PUBLIC_URL is unset (honors the ingress). */
function requestOrigin(request: FastifyRequest): string {
  const proto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || request.protocol;
  const host = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || request.headers.host || 'localhost';
  return `${proto}://${host}`;
}

/** Best client address for throttling (first XFF hop behind the ingress, else socket ip). */
function clientIp(request: FastifyRequest): string {
  return (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || request.ip;
}

/** '' when acceptable, otherwise the reason. */
function passwordPolicyError(password: string): string {
  if ((password ?? '').length < config.auth.passwordMinLength) {
    return `Password must be at least ${config.auth.passwordMinLength} characters`;
  }
  return '';
}

/**
 * Decide whether a newly-created user needs email verification. Requires the feature flag, a
 * working SMTP config, and an email to send to. Returns the pending status + token to store,
 * and fires the email (best-effort).
 */
async function maybeStartVerification(email: string | undefined, username: string): Promise<{ status: 'active' | 'pending'; verifyToken: string }> {
  if (!config.auth.requireEmailVerification || !isEmailEnabled() || !email) {
    return { status: 'active', verifyToken: '' };
  }
  const verifyToken = randomBytes(24).toString('hex');
  sendVerificationEmail(email, username, verifyToken).catch((err) => log.warn(`verification email to ${email} failed`, err));
  return { status: 'pending', verifyToken };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── Login methods (public) — which options the login screen renders ──
  app.get('/api/auth/methods', async (): Promise<AuthMethodsInfo> => ({
    local: config.auth.local.enabled,
    mfaMode: config.auth.mfaMode,
    providers: enabledProviders(),
  }));

  // Email verification landing — clicked from the confirmation email. Activates the account and
  // redirects to the SPA with a notice (public; no session needed).
  app.get<{ Querystring: { token?: string } }>('/api/auth/verify', async (request, reply) => {
    const row = request.query.token ? await userRepo.findRowByVerifyToken(request.query.token) : undefined;
    if (!row) return reply.redirect('/#verify_error=' + encodeURIComponent('This confirmation link is invalid or already used.'));
    await userRepo.activate(row.id);
    audit('auth.user.verified', { id: row.id, username: row.username });
    return reply.redirect('/#verified=1');
  });

  app.post<{ Body: LoginInput }>('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body ?? ({} as LoginInput);
    if (!username || !password) {
      return reply.status(400).send({ error: true, message: 'username and password are required' });
    }
    const ip = clientIp(request);
    const retryAfter = loginRetryAfter(username, ip);
    if (retryAfter > 0) {
      return reply.status(429).header('retry-after', String(retryAfter))
        .send({ error: true, message: `Too many attempts — try again in ${retryAfter}s` });
    }
    const row = await userRepo.findRowByUsername(username);
    if (!row || !verifyPassword(password, row.password_hash, row.salt)) {
      recordLoginFailure(username, ip);
      audit('auth.login.failed', row ? { id: row.id, username } : { username }, `from ${ip}`);
      return reply.status(401).send({ error: true, message: 'Invalid username or password' });
    }
    // SSO-only deployments: password sign-in stays open to admins as a break-glass
    // (AUTH_LOCAL_ADMIN_BREAK_GLASS=false for strict SSO-only).
    const breakGlass = !config.auth.local.enabled;
    if (breakGlass && !(config.auth.local.adminBreakGlass && row.role === 'admin')) {
      return reply.status(403).send({ error: true, message: 'Password sign-in is disabled — use SSO' });
    }
    if (row.status === 'pending') {
      return reply.status(403).send({ error: true, message: 'Account pending — confirm your email to activate it' });
    }
    clearLoginFailures(username, ip);
    if (row.totp_enabled) {
      return reply.send({ mfaRequired: true, mfaToken: signMfaToken(row.id) });
    }
    const user = (await userRepo.findById(row.id))!;
    const result = await issueSession(user);
    if (config.auth.mfaMode === 'required') result.mfaSetupRequired = true;
    audit(breakGlass ? 'auth.login.breakglass' : 'auth.login', user, `from ${ip}`);
    return reply.send(result);
  });

  // ── Self-service password change (also serves the forced-rotation step at login) ──
  app.post<{ Body: ChangePasswordInput }>('/api/auth/password', async (request, reply) => {
    const me = (request as AuthedRequest).authUser!;
    const { currentPassword, newPassword } = request.body ?? ({} as ChangePasswordInput);
    const row = (await userRepo.findRowById(me.id))!;
    if (!currentPassword || !verifyPassword(currentPassword, row.password_hash, row.salt)) {
      return reply.status(401).send({ error: true, message: 'Current password is incorrect' });
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return reply.status(400).send({ error: true, message: policyError });
    if (newPassword === currentPassword) {
      return reply.status(400).send({ error: true, message: 'New password must differ from the current one' });
    }
    await userRepo.setPassword(me.id, newPassword, { mustChange: false });
    // Changing the password logs out every other session; hand this one a fresh token.
    const tokenVersion = await userRepo.bumpTokenVersion(me.id);
    audit('auth.password.changed', me);
    return reply.send({ token: signToken(me.id, tokenVersion), user: await userRepo.findById(me.id) });
  });

  // ── TOTP second factor ──
  app.post<{ Body: MfaVerifyInput }>('/api/auth/mfa/verify', async (request, reply) => {
    const { mfaToken, code } = request.body ?? ({} as MfaVerifyInput);
    const uid = mfaToken ? verifyMfaToken(mfaToken) : null;
    if (!uid) return reply.status(401).send({ error: true, message: 'MFA challenge expired — sign in again' });
    const retryAfter = mfaRetryAfter(uid);
    if (retryAfter > 0) {
      return reply.status(429).header('retry-after', String(retryAfter))
        .send({ error: true, message: `Too many attempts — try again in ${retryAfter}s` });
    }
    const row = await userRepo.findRowById(uid);
    if (!row?.totp_enabled || !(await consumeTotp(row, code ?? ''))) {
      recordMfaFailure(uid);
      audit('auth.mfa.failed', row ? { id: row.id, username: row.username } : null);
      return reply.status(401).send({ error: true, message: 'Invalid verification code' });
    }
    clearMfaFailures(uid);
    const user = (await userRepo.findById(uid))!;
    audit('auth.login', user, 'mfa');
    return reply.send(await issueSession(user));
  });

  app.post('/api/auth/mfa/setup', async (request, reply) => {
    const me = (request as AuthedRequest).authUser!;
    const row = (await userRepo.findRowById(me.id))!;
    if (row.totp_enabled) {
      return reply.status(409).send({ error: true, message: 'Two-factor is already enabled — disable it first' });
    }
    const secret = generateTotpSecret();
    await userRepo.setTotp(me.id, { secret, enabled: false });
    return reply.send({ secret, otpauthUrl: otpauthUrl(secret, me.username) });
  });

  app.post<{ Body: { code?: string } }>('/api/auth/mfa/enable', async (request, reply) => {
    const me = (request as AuthedRequest).authUser!;
    const row = (await userRepo.findRowById(me.id))!;
    if (!row.totp_secret || !(await consumeTotp(row, request.body?.code ?? ''))) {
      return reply.status(400).send({ error: true, message: 'Invalid verification code' });
    }
    await userRepo.setTotp(me.id, { enabled: true });
    audit('auth.mfa.enabled', me);
    return reply.send(await userRepo.findById(me.id));
  });

  app.post<{ Body: { code?: string } }>('/api/auth/mfa/disable', async (request, reply) => {
    const me = (request as AuthedRequest).authUser!;
    const row = (await userRepo.findRowById(me.id))!;
    if (row.totp_enabled && !(await consumeTotp(row, request.body?.code ?? ''))) {
      return reply.status(400).send({ error: true, message: 'Invalid verification code' });
    }
    await userRepo.setTotp(me.id, { secret: '', enabled: false });
    clearMfaFailures(me.id);
    audit('auth.mfa.disabled', me);
    return reply.send(await userRepo.findById(me.id));
  });

  // ── SSO (Entra ID / generic OIDC / GitHub) ──
  app.get<{ Params: { provider: string } }>('/api/auth/sso/:provider/start', async (request, reply) => {
    const { provider } = request.params;
    if (!isProviderEnabled(provider)) {
      return reply.status(404).send({ error: true, message: `SSO provider not enabled: ${provider}` });
    }
    const url = await beginSso(provider, callbackUrl(provider, requestOrigin(request)));
    return reply.redirect(url);
  });

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    '/api/auth/sso/:provider/callback',
    async (request, reply) => {
      const { provider } = request.params;
      // Token travels in the URL fragment — browsers never send fragments, so it stays out of
      // server/proxy logs; the SPA picks it up on load and immediately strips it.
      const fail = (message: string) => reply.redirect(`/#sso_error=${encodeURIComponent(message)}`);
      if (!isProviderEnabled(provider)) return fail(`SSO provider not enabled: ${provider}`);
      const { code, state, error, error_description } = request.query;
      if (error) return fail(error_description || `Sign-in was cancelled (${error})`);
      const stateCheck = state ? verifySsoState(state, provider) : { valid: false };
      if (!code || !stateCheck.valid) return fail('Sign-in expired — please try again');
      try {
        const identity = await exchangeCode(provider, code, callbackUrl(provider, requestOrigin(request)), stateCheck.pkceVerifier);
        const user = await resolveSsoUser(identity);
        if (user.status === 'pending') return fail('Account pending — confirm your email to activate it');
        const result = await issueSession(user); // MFA is the IdP's job for SSO sign-ins
        audit('auth.login.sso', user, provider);
        return reply.redirect(`/#sso_token=${encodeURIComponent(result.token)}`);
      } catch (err) {
        if (err instanceof SsoError) return fail(err.message);
        log.error(`SSO callback failed (${provider})`, err);
        return fail('Sign-in failed — contact your administrator');
      }
    },
  );

  app.get('/api/auth/me', async (request, reply) => {
    return reply.send((request as AuthedRequest).authUser);
  });

  app.get('/api/auth/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const [users, identities] = await Promise.all([userRepo.list(), userIdentityRepo.providersByUser()]);
    return reply.send(users.map((u) => ({ ...u, identityProviders: identities[u.id] ?? [] })));
  });

  // Current-month token consumption per user (for the personal quota readout).
  app.get('/api/auth/users/usage', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const [users, usage] = await Promise.all([userRepo.list(), userUsageRepo.allForPeriod()]);
    const period = currentPeriod();
    return reply.send(users.map((u): UserUsage => {
      const row = usage[u.id];
      return {
        userId: u.id, period,
        totalTokens: row?.totalTokens ?? 0, costUsd: row?.costUsd ?? 0, requestCount: row?.requestCount ?? 0,
        quota: u.tokenQuota,
      };
    }));
  });

  app.post<{ Body: CreateUserInput }>('/api/auth/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { username, password, role, groupIds, tokenQuota } = request.body ?? ({} as CreateUserInput);
    if (!username || !password) {
      return reply.status(400).send({ error: true, message: 'username and password are required' });
    }
    const policyError = passwordPolicyError(password);
    if (policyError) return reply.status(400).send({ error: true, message: policyError });
    if (await userRepo.findRowByUsername(username)) {
      return reply.status(409).send({ error: true, message: 'Username already exists' });
    }
    const { email } = request.body ?? ({} as CreateUserInput);
    const verification = await maybeStartVerification(email, username);
    // Admin-set passwords are provisional — the user must pick their own at first login.
    const created = await userRepo.create({ username, password, role, groupIds, tokenQuota, email, mustChangePassword: true, ...verification });
    audit('auth.user.created', (request as AuthedRequest).authUser ?? null, username);
    return reply.status(201).send(created);
  });

  // ── Entra directory picker (admin) — search the tenant, add a user pre-linked to their
  //    directory identity. With autoProvision=false this is the only door for SSO users. ──
  app.get<{ Querystring: { query?: string } }>('/api/auth/entra/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    if (!config.auth.sso.entra.enabled) {
      return reply.status(404).send({ error: true, message: 'Entra ID is not enabled' });
    }
    try {
      return reply.send(await searchEntraUsers(request.query.query ?? ''));
    } catch (err) {
      if (err instanceof SsoError) return reply.status(502).send({ error: true, message: err.message });
      log.error('Entra directory search failed', err);
      return reply.status(502).send({ error: true, message: 'Directory search failed — check the server logs' });
    }
  });

  app.post<{ Body: AddEntraUserInput }>('/api/auth/users/from-entra', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    if (!config.auth.sso.entra.enabled) {
      return reply.status(404).send({ error: true, message: 'Entra ID is not enabled' });
    }
    const { id, email, displayName, role, groupIds } = request.body ?? ({} as AddEntraUserInput);
    if (!id || !email) return reply.status(400).send({ error: true, message: 'id and email are required' });
    if (await userIdentityRepo.findByProviderSubject('entra', id)) {
      return reply.status(409).send({ error: true, message: 'This Entra user is already added' });
    }
    const username = await freeUsername(usernameFromHandle(email));
    const verification = await maybeStartVerification(email, username);
    const user = await userRepo.create({
      username,
      password: randomBytes(32).toString('hex'), // unusable — this account signs in via Entra
      role: role ?? 'contributor',
      groupIds,
      email,
      ...verification,
    });
    // Pre-link to the directory object id — the login callback matches it via the oid claim.
    await userIdentityRepo.link({ userId: user.id, provider: 'entra', subject: id, email, displayName });
    audit('auth.user.created', (request as AuthedRequest).authUser ?? null, `${username} (entra)`);
    return reply.status(201).send({ ...user, identityProviders: ['entra'] });
  });

  app.patch<{ Params: { id: string }; Body: UpdateUserInput }>(
    '/api/auth/users/:id',
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const admin = (request as AuthedRequest).authUser!;
      const targetId = request.params.id;
      const { resetMfa, revokeSessions, ...fields } = request.body ?? {};
      if (fields.password) {
        const policyError = passwordPolicyError(fields.password);
        if (policyError) return reply.status(400).send({ error: true, message: policyError });
      }
      const updated = await userRepo.update(targetId, {
        ...fields,
        // Admin resetting someone else's password → provisional, must rotate at next login.
        ...(fields.password ? { mustChangePassword: targetId !== admin.id } : {}),
      });
      if (!updated) return reply.status(404).send({ error: true, message: 'User not found' });
      if (resetMfa) {
        await userRepo.setTotp(targetId, { secret: '', enabled: false });
        clearMfaFailures(targetId);
        audit('auth.mfa.reset', admin, updated.username);
      }
      // Password change or explicit revoke → every outstanding token dies.
      if (revokeSessions || fields.password) {
        await userRepo.bumpTokenVersion(targetId);
        if (revokeSessions) audit('auth.sessions.revoked', admin, updated.username);
      }
      return reply.send(await userRepo.findById(targetId));
    },
  );

  app.delete<{ Params: { id: string } }>('/api/auth/users/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const self = (request as AuthedRequest).authUser;
    if (self?.id === request.params.id) {
      return reply.status(400).send({ error: true, message: 'You cannot delete your own account' });
    }
    if (!(await userRepo.remove(request.params.id))) return reply.status(404).send({ error: true, message: 'User not found' });
    await userIdentityRepo.removeForUser(request.params.id);
    return reply.status(204).send();
  });

  // ── Permission groups (admin) — role + project access + token quota; users belong to groups ──
  app.get('/api/auth/groups', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send(await groupRepo.list());
  });

  // Current-month token consumption per group (for the quota readout).
  app.get('/api/auth/groups/usage', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const [groups, usage] = await Promise.all([groupRepo.list(), groupUsageRepo.allForPeriod()]);
    const period = currentPeriod();
    return reply.send(groups.map((g): GroupUsage => {
      const u = usage[g.id];
      return {
        groupId: g.id, period,
        totalTokens: u?.totalTokens ?? 0, costUsd: u?.costUsd ?? 0, requestCount: u?.requestCount ?? 0,
        quota: g.tokenQuota,
      };
    }));
  });

  app.post<{ Body: { name: string; role?: string; projectIds?: string[]; tokenQuota?: number | null } }>('/api/auth/groups', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { name, role, projectIds, tokenQuota } = request.body ?? ({} as { name: string });
    if (!name?.trim()) return reply.status(400).send({ error: true, message: 'name is required' });
    return reply.status(201).send(await groupRepo.create({ name: name.trim(), role, projectIds, tokenQuota }));
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; role?: string; projectIds?: string[]; tokenQuota?: number | null } }>(
    '/api/auth/groups/:id',
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const updated = await groupRepo.update(request.params.id, request.body ?? {});
      if (!updated) return reply.status(404).send({ error: true, message: 'Group not found' });
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/auth/groups/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    if (!(await groupRepo.remove(request.params.id))) return reply.status(404).send({ error: true, message: 'Group not found' });
    return reply.status(204).send();
  });

  // ── Custom roles (admin) — named capability sets attachable to groups ──
  const cleanCaps = (caps: unknown): Capability[] => {
    const arr = Array.isArray(caps) ? caps : [];
    return arr.filter((c): c is Capability => (ALL_CAPABILITIES as string[]).includes(c as string));
  };

  app.get('/api/auth/roles', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send(await roleRepo.list());
  });

  app.post<{ Body: CreateRoleInput }>('/api/auth/roles', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { name, description, capabilities } = request.body ?? ({} as CreateRoleInput);
    if (!name?.trim()) return reply.status(400).send({ error: true, message: 'name is required' });
    const created = await roleRepo.create({ name: name.trim(), description: description?.trim() ?? '', capabilities: cleanCaps(capabilities) });
    clearRoleCache();
    audit('auth.role.created', (request as AuthedRequest).authUser ?? null, created.name);
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string }; Body: UpdateRoleInput }>('/api/auth/roles/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body ?? {};
    const updated = await roleRepo.update(request.params.id, {
      name: body.name?.trim(),
      description: body.description !== undefined ? body.description.trim() : undefined,
      capabilities: body.capabilities !== undefined ? cleanCaps(body.capabilities) : undefined,
    });
    if (!updated) return reply.status(404).send({ error: true, message: 'Role not found' });
    clearRoleCache();
    return reply.send(updated);
  });

  app.delete<{ Params: { id: string } }>('/api/auth/roles/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    // Groups still referencing this role fall back to their members' own role (caps → none extra).
    if (!(await roleRepo.remove(request.params.id))) return reply.status(404).send({ error: true, message: 'Role not found' });
    clearRoleCache();
    return reply.status(204).send();
  });
}
