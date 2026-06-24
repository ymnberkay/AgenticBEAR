/**
 * Auth primitives — salted password hashing (scrypt) + stateless HMAC session tokens.
 * No external deps; token = base64url(payload).base64url(hmac). Verified on every /api request.
 */
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

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

/** Issue a session token for a user id (valid for config.auth.tokenTtlHours). */
export function signToken(userId: string): string {
  const exp = Date.now() + config.auth.tokenTtlHours * 3_600_000;
  const payload = b64url(JSON.stringify({ uid: userId, exp }));
  return `${payload}.${sign(payload)}`;
}

/** Verify a token → userId, or null if invalid/expired/tampered. */
export function verifyToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64').toString()) as { uid: string; exp: number };
    if (!uid || typeof exp !== 'number' || exp <= Date.now()) return null;
    return uid;
  } catch {
    return null;
  }
}
