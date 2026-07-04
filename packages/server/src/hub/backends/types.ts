import { createHash } from 'node:crypto';
import { config } from '../../config.js';

/** Who a session belongs to — carried through provisioning so objects get readable names. */
export interface SessionUser {
  id: string;
  username: string;
}

/** One user's provisioned session runtime, as the backend sees it. */
export interface SessionRecord {
  uid: string;
  username: string;
  /** DNS-1123 object name shared by Pod/Service/Ingress: agb-session-<username>[-<hash6>]. */
  name: string;
  hash: string;
  /** URL the hub uses for health/activity polling (cluster-internal Service DNS). */
  internalUrl: string;
  /** Base the browser prepends to data-plane requests (ingress path, or absolute URL in dev). */
  publicBaseUrl: string;
}

export interface SessionBackend {
  /** Create or adopt the session workload for a user. Idempotent (409s are adoption). */
  start(user: SessionUser): Promise<SessionRecord>;
  /** Delete the running workload only — routing objects (Service/Ingress) persist so a reaped
   *  session resolves to a deterministic 503 and the wake flow can recreate just the Pod. */
  stop(record: SessionRecord): Promise<void>;
  /** Existing sessions, for hub-boot reconcile. */
  list(): Promise<SessionRecord[]>;
}

/** Short uid hash — stable, DNS-safe uniqueness/routing token (uids are nanoid). */
export function userHash(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 12);
}

/** DNS-1123-safe slug of the username, for readable object/volume names. */
export function usernameSlug(username: string): string {
  const slug = username
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'user';
}

/**
 * Session object name. Plain `agb-session-<username>` when the username is already DNS-safe
 * (the common case, easy to track with kubectl). If sanitization had to change it, two distinct
 * usernames could collide on the same slug ("user_a"/"user.a" → "user-a"), so a short uid hash
 * is appended to keep the name unique.
 */
export function sessionName(user: SessionUser): string {
  const slug = usernameSlug(user.username);
  return slug === user.username
    ? `agb-session-${slug}`
    : `agb-session-${slug}-${userHash(user.id).slice(0, 6)}`;
}

export function publicBasePath(uid: string): string {
  return `${config.hub.basePrefix}/${userHash(uid)}`;
}
