/**
 * Brute-force guard for the login surfaces. Sliding window of FAILED attempts per key
 * (account, source IP, MFA challenge); successes clear the key. In-process state — fine for
 * the single hub replica that terminates all logins (chart pins replicaCount: 1).
 */

interface Rule { max: number; windowMs: number }

/** Failed password attempts per username. */
const ACCOUNT: Rule = { max: 10, windowMs: 15 * 60_000 };
/** Failed password attempts per source IP (covers username spraying). */
const IP: Rule = { max: 30, windowMs: 15 * 60_000 };
/** Failed TOTP codes per user (6 digits — keep this tight). */
const MFA: Rule = { max: 5, windowMs: 5 * 60_000 };

const failures = new Map<string, number[]>();

function prune(key: string, rule: Rule, now: number): number[] {
  const arr = (failures.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (arr.length === 0) failures.delete(key);
  else failures.set(key, arr);
  return arr;
}

function check(key: string, rule: Rule, now: number): number {
  const arr = prune(key, rule, now);
  if (arr.length < rule.max) return 0;
  return Math.ceil((arr[0] + rule.windowMs - now) / 1000);
}

/** Seconds until another password attempt is allowed (0 = go ahead). */
export function loginRetryAfter(username: string, ip: string, now = Date.now()): number {
  return Math.max(check(`acct:${username}`, ACCOUNT, now), check(`ip:${ip}`, IP, now));
}

export function recordLoginFailure(username: string, ip: string, now = Date.now()): void {
  failures.set(`acct:${username}`, [...(failures.get(`acct:${username}`) ?? []), now]);
  failures.set(`ip:${ip}`, [...(failures.get(`ip:${ip}`) ?? []), now]);
}

export function clearLoginFailures(username: string, ip: string): void {
  failures.delete(`acct:${username}`);
  failures.delete(`ip:${ip}`);
}

/** Seconds until another TOTP attempt is allowed for this user (0 = go ahead). */
export function mfaRetryAfter(userId: string, now = Date.now()): number {
  return check(`mfa:${userId}`, MFA, now);
}

export function recordMfaFailure(userId: string, now = Date.now()): void {
  failures.set(`mfa:${userId}`, [...(failures.get(`mfa:${userId}`) ?? []), now]);
}

export function clearMfaFailures(userId: string): void {
  failures.delete(`mfa:${userId}`);
}

/** Tests only. */
export function resetThrottle(): void {
  failures.clear();
}
