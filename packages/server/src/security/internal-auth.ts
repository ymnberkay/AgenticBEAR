/**
 * Hub ↔ session-pod internal auth. The activity endpoint lives outside /api/* (skips authHook)
 * and is reachable through the per-user ingress rewrite, so it carries a timestamped HMAC header
 * (x-agb-internal: <ts>.<hmac>) that only holders of AUTH_SECRET can produce.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const WINDOW_MS = 60_000;

const hmac = (ts: string) =>
  createHmac('sha256', config.auth.secret).update(`agb-internal:${ts}`).digest('hex');

export function signInternalHeader(): string {
  const ts = String(Date.now());
  return `${ts}.${hmac(ts)}`;
}

export function verifyInternalHeader(value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.indexOf('.');
  if (dot === -1) return false;
  const ts = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const age = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(age) || age > WINDOW_MS) return false;
  const expected = hmac(ts);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
