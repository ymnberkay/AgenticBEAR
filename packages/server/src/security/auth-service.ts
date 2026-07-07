/**
 * Auth primitives — salted password hashing (scrypt) + stateless HMAC session tokens.
 * No external deps; token = base64url(payload).base64url(hmac). Verified on every /api request.
 */
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { seal, open } from './secret-box.js';

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payload: string): string {
  return b64url(createHmac('sha256', config.auth.secret).update(payload).digest());
}

interface TokenPayload {
  uid?: string;
  exp: number;
  /** Issued-at (ms). Absent on tokens minted before sliding renewal shipped. */
  iat?: number;
  /** users.token_version at issue time — bumping the column revokes the token. */
  v?: number;
  /** Token purpose. Absent = session (back-compat with tokens issued before SSO/MFA). */
  typ?: 'mfa' | 'state';
  /** Extra claims (SSO state carries the provider id + sealed PKCE verifier). */
  [k: string]: unknown;
}

/** Verified session-token claims, as consumed by the auth middleware. */
export interface SessionClaims {
  uid: string;
  iat: number;
  exp: number;
  /** Token version baked into the token (0 for legacy tokens). */
  tokenVersion: number;
}

function signPayload(claims: TokenPayload): string {
  const payload = b64url(JSON.stringify(claims));
  return `${payload}.${sign(payload)}`;
}

function verifyPayload(token: string): TokenPayload | null {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString()) as TokenPayload;
    if (typeof claims.exp !== 'number' || claims.exp <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Issue a session token for a user id (valid for config.auth.tokenTtlHours). */
export function signToken(userId: string, tokenVersion = 0): string {
  const iat = Date.now();
  return signPayload({ uid: userId, iat, exp: iat + config.auth.tokenTtlHours * 3_600_000, v: tokenVersion });
}

/** Verify a session token → claims, or null. Purpose-tagged tokens (mfa/state) are rejected. */
export function verifyToken(token: string): SessionClaims | null {
  const claims = verifyPayload(token);
  if (!claims || claims.typ || !claims.uid) return null;
  return {
    uid: claims.uid,
    exp: claims.exp,
    // Legacy tokens carry no iat — assume they were minted a full TTL before expiry.
    iat: typeof claims.iat === 'number' ? claims.iat : claims.exp - config.auth.tokenTtlHours * 3_600_000,
    tokenVersion: typeof claims.v === 'number' ? claims.v : 0,
  };
}

/** Sliding sessions: past the halfway point of its lifetime, a token should be reissued. */
export function needsRefresh(claims: SessionClaims, now = Date.now()): boolean {
  return now > claims.iat + (claims.exp - claims.iat) / 2;
}

/**
 * MFA-pending token: password (or SSO redirect) succeeded but the TOTP code is still owed.
 * Only POST /api/auth/mfa/verify accepts it — verifyToken() above rejects the 'mfa' tag.
 */
export function signMfaToken(userId: string): string {
  return signPayload({ uid: userId, exp: Date.now() + 5 * 60_000, typ: 'mfa' });
}

export function verifyMfaToken(token: string): string | null {
  const claims = verifyPayload(token);
  if (!claims || claims.typ !== 'mfa' || !claims.uid) return null;
  return claims.uid;
}

/**
 * OAuth `state` param — CSRF-proof because only this server can mint it (10 min window).
 * Carries the PKCE verifier sealed (AES-GCM), so the flow stays stateless without exposing
 * the verifier to whoever holds the callback URL.
 */
export function signSsoState(provider: string, pkceVerifier?: string): string {
  return signPayload({
    exp: Date.now() + 10 * 60_000, typ: 'state', p: provider,
    ...(pkceVerifier ? { pv: seal(pkceVerifier) } : {}),
  });
}

export function verifySsoState(token: string, provider: string): { valid: boolean; pkceVerifier?: string } {
  const claims = verifyPayload(token);
  if (!claims || claims.typ !== 'state' || claims.p !== provider) return { valid: false };
  const sealed = typeof claims.pv === 'string' ? claims.pv : undefined;
  return { valid: true, pkceVerifier: sealed ? (open(sealed) ?? undefined) : undefined };
}
