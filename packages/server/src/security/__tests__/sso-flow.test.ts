/**
 * SSO flow against a mock OIDC IdP (real HTTP server) + a temp SQLite DB:
 * discovery, PKCE, code exchange, claim merging, and JIT / auto-link / group-mapping
 * behavior of resolveSsoUser.
 */
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Runs before the (hoisted) imports below, so config.ts picks these up. No outer-scope
// bindings allowed here — imports aren't initialized yet.
vi.hoisted(() => {
  process.env.DB_PATH = `${process.env.TMPDIR ?? '/tmp'}/agb-sso-test-${process.pid}.db`;
  process.env.AUTH_SECRET = 'sso-test-secret';
});

import { config } from '../../config.js';
import { initDb } from '../../db/client.js';
import { userRepo } from '../../db/repositories/user.repo.js';
import { groupRepo } from '../../db/repositories/group.repo.js';
import { userIdentityRepo } from '../../db/repositories/user-identity.repo.js';
import { beginSso, exchangeCode, resolveSsoUser, enabledProviders } from '../sso.js';
import { verifySsoState } from '../auth-service.js';

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (payload: Record<string, unknown>) => `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify(payload))}.sig`;

let server: Server;
let issuer: string;
/** Captured body of the last token-endpoint call (PKCE assertions). */
let lastTokenBody = '';
/** id_token groups returned by the mock (per-test). */
let idTokenGroups: string[] = [];
/** userinfo sub returned by the mock (per-test → distinct identities). */
let mockSub = 'sub-1';
let mockEmail = 'jane@example.com';

beforeAll(async () => {
  server = createServer((req, res) => {
    const send = (obj: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.url?.startsWith('/.well-known/openid-configuration')) {
      return send({
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
      });
    }
    if (req.url === '/token') {
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString(); });
      req.on('end', () => {
        lastTokenBody = body;
        send({
          access_token: 'at-123',
          id_token: fakeJwt({ sub: mockSub, groups: idTokenGroups, email: 'stale@idtoken.example' }),
        });
      });
      return;
    }
    if (req.url === '/userinfo') {
      return send({ sub: mockSub, email: mockEmail, preferred_username: mockEmail, name: 'Jane Doe' });
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  issuer = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  // The provider registry reads config live — point the generic OIDC provider at the mock.
  Object.assign(config.auth.sso.oidc, {
    enabled: true, displayName: 'MockIdP', issuer,
    clientId: 'test-client', clientSecret: 'test-secret', scopes: 'openid profile email',
  });

  await initDb();
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('sso begin + exchange (mock IdP)', () => {
  it('authorize URL carries S256 PKCE bound to the sealed state verifier', async () => {
    expect(enabledProviders().map((p) => p.id)).toContain('oidc');
    const url = new URL(await beginSso('oidc', 'https://app.example/api/auth/sso/oidc/callback'));
    expect(url.origin + url.pathname).toBe(`${issuer}/authorize`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const state = url.searchParams.get('state')!;
    const check = verifySsoState(state, 'oidc');
    expect(check.valid).toBe(true);
    const expected = b64url(createHash('sha256').update(check.pkceVerifier!).digest());
    expect(url.searchParams.get('code_challenge')).toBe(expected);
  });

  it('exchanges the code with the verifier and merges id_token + userinfo claims', async () => {
    idTokenGroups = ['platform-admins', 'everyone'];
    const identity = await exchangeCode('oidc', 'code-1', 'https://app.example/cb', 'the-verifier');
    expect(lastTokenBody).toContain('code_verifier=the-verifier');
    expect(lastTokenBody).toContain('grant_type=authorization_code');
    expect(identity.subject).toBe('sub-1');
    expect(identity.email).toBe('jane@example.com'); // userinfo wins over the id_token claim
    expect(identity.groups).toEqual(['platform-admins', 'everyone']); // from the id_token
  });
});

describe('resolveSsoUser', () => {
  it('JIT-provisions with the mail local-part as username and reuses the linked user afterwards', async () => {
    mockSub = 'jit-sub';
    mockEmail = 'jit.person@example.com';
    const identity = await exchangeCode('oidc', 'c', 'https://app.example/cb');
    expect(identity.username).toBe('jit.person'); // local-part → clean session-pod slugs
    const user = await resolveSsoUser(identity);
    expect(user.username).toBe('jit.person');
    expect(user.role).toBe(config.auth.sso.defaultRole);
    expect(await userIdentityRepo.findByProviderSubject('oidc', 'jit-sub')).toBeTruthy();

    const again = await resolveSsoUser(identity);
    expect(again.id).toBe(user.id);
  });

  it('auto-links to an existing user whose username matches the IdP email', async () => {
    const existing = await userRepo.create({ username: 'linked@example.com', password: 'longpassword1', role: 'viewer' });
    mockSub = 'link-sub';
    mockEmail = 'linked@example.com';
    const identity = await exchangeCode('oidc', 'c', 'https://app.example/cb');
    const user = await resolveSsoUser(identity);
    expect(user.id).toBe(existing.id);
    expect(user.role).toBe('viewer'); // linking never touches the role
  });

  it('refuses unknown identities when autoProvision is off', async () => {
    config.auth.sso.autoProvision = false;
    mockSub = 'stranger-sub';
    mockEmail = 'stranger@example.com';
    const identity = await exchangeCode('oidc', 'c', 'https://app.example/cb');
    await expect(resolveSsoUser(identity)).rejects.toThrow(/No account/);
    config.auth.sso.autoProvision = true;
  });

  it('replaces permission groups from the IdP when a mapping is configured', async () => {
    const eng = await groupRepo.create({ name: 'Engineering' });
    await groupRepo.create({ name: 'Admins' });
    (config.auth.sso as { groupMapping: Record<string, string> }).groupMapping = {
      'idp-eng': 'Engineering',
      'idp-admins': 'Admins',
    };

    mockSub = 'grp-sub';
    mockEmail = 'grp@example.com';
    idTokenGroups = ['idp-eng', 'unmapped-group'];
    let user = await resolveSsoUser(await exchangeCode('oidc', 'c', 'https://app.example/cb'));
    expect(user.groupIds).toEqual([eng.id]);

    // Next login the IdP dropped the group → local membership follows.
    idTokenGroups = [];
    user = await resolveSsoUser(await exchangeCode('oidc', 'c', 'https://app.example/cb'));
    expect(user.groupIds).toEqual([]);

    (config.auth.sso as { groupMapping: Record<string, string> }).groupMapping = {};
  });
});
