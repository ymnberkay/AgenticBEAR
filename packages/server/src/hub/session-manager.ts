/**
 * Hub-side session registry + lifecycle. In-memory (hub runs a single replica in v1; the path
 * to N replicas is a Postgres-backed registry + leader-elected reaper).
 *
 * Because the data plane bypasses the hub (browser → ingress → session pod), idleness is
 * self-reported: the reaper polls each pod's /internal/activity and reaps only sessions that
 * are past TTL *and* not busy (no active runs, no open SSE streams).
 */
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { signInternalHeader } from '../security/internal-auth.js';
import type { SessionBackend, SessionRecord, SessionUser } from './backends/types.js';
import { publicBasePath } from './backends/types.js';
import type { SessionInfo } from '@subagent/shared';

const log = createLogger('hub:sessions');

interface Entry {
  record: SessionRecord;
  state: 'starting' | 'ready';
  lastActive: number;
  unreachableCount: number;
}

const REAP_INTERVAL_MS = 60_000;
/** Consecutive failed activity polls before a session is declared dead. */
const MAX_UNREACHABLE = 2;

async function createBackend(): Promise<SessionBackend> {
  if (config.hub.sessionBackend === 'process') {
    const { LocalProcessBackend } = await import('./backends/local-process.js');
    return new LocalProcessBackend();
  }
  const { KubernetesBackend } = await import('./backends/kubernetes.js');
  return new KubernetesBackend();
}

class SessionManager {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<SessionInfo>>();
  private backendPromise: Promise<SessionBackend> | undefined;
  private reapTimer: NodeJS.Timeout | undefined;

  private backend(): Promise<SessionBackend> {
    this.backendPromise ??= createBackend();
    return this.backendPromise;
  }

  /** Non-blocking view for the client: none → login/wake should trigger ensure. */
  getStatus(uid: string): SessionInfo {
    const entry = this.entries.get(uid);
    if (!entry) return { status: 'none', baseUrl: publicBasePath(uid) };
    return { status: entry.state, baseUrl: entry.record.publicBaseUrl };
  }

  /**
   * Create (or adopt) the user's session and wait until its /api/health answers.
   * Single-flight per user — concurrent logins/wakes share one provisioning attempt.
   */
  ensureSession(user: SessionUser): Promise<SessionInfo> {
    const pending = this.inflight.get(user.id);
    if (pending) return pending;

    // Registered synchronously so concurrent logins/wakes share one provisioning attempt.
    const attempt = this.ensureLive(user).finally(() => this.inflight.delete(user.id));
    this.inflight.set(user.id, attempt);
    return attempt;
  }

  /** "Ready" in the registry can be stale (pod deleted/evicted behind our back) — trust it only
   *  after a live health check; otherwise re-provision (backend.start recreates what's missing). */
  private async ensureLive(user: SessionUser): Promise<SessionInfo> {
    const entry = this.entries.get(user.id);
    if (entry?.state === 'ready' && (await this.healthy(entry.record))) return this.getStatus(user.id);
    return this.provision(user);
  }

  private async provision(user: SessionUser): Promise<SessionInfo> {
    const uid = user.id;
    const backend = await this.backend();
    const record = await backend.start(user);
    const entry: Entry = this.entries.get(uid) ?? { record, state: 'starting', lastActive: Date.now(), unreachableCount: 0 };
    entry.record = record;
    entry.state = 'starting';
    this.entries.set(uid, entry);

    const deadline = Date.now() + config.hub.readyTimeoutSeconds * 1000;
    while (Date.now() < deadline) {
      if (await this.healthy(record)) {
        entry.state = 'ready';
        entry.lastActive = Date.now();
        entry.unreachableCount = 0;
        log.info(`Session ready for ${user.username} at ${record.publicBaseUrl} (${record.name})`);
        return this.getStatus(uid);
      }
      await sleep(2000);
    }
    log.warn(`Session for ${user.username} not ready after ${config.hub.readyTimeoutSeconds}s (still starting)`);
    return this.getStatus(uid);
  }

  private async healthy(record: SessionRecord): Promise<boolean> {
    try {
      const res = await fetch(`${record.internalUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Adopt sessions that already exist (hub restart must not kick active users). */
  async reconcile(): Promise<void> {
    const backend = await this.backend();
    const records = await backend.list();
    for (const record of records) {
      const ready = await this.healthy(record);
      this.entries.set(record.uid, {
        record,
        state: ready ? 'ready' : 'starting',
        lastActive: Date.now(), // conservative: restart resets idle clocks instead of mass-reaping
        unreachableCount: 0,
      });
    }
    if (records.length) log.info(`Reconciled ${records.length} existing session(s)`);
  }

  startReaper(): void {
    this.reapTimer = setInterval(() => { void this.reapTick(); }, REAP_INTERVAL_MS);
    log.info(`Idle reaper: TTL ${config.hub.ttlSeconds}s, checking every ${REAP_INTERVAL_MS / 1000}s`);
  }

  stopReaper(): void {
    if (this.reapTimer) clearInterval(this.reapTimer);
  }

  private async reapTick(): Promise<void> {
    const backend = await this.backend();
    for (const [uid, entry] of this.entries) {
      if (entry.state !== 'ready') continue; // starting sessions have their own timeout
      const activity = await this.fetchActivity(entry.record);

      if (!activity) {
        entry.unreachableCount += 1;
        if (entry.unreachableCount >= MAX_UNREACHABLE) {
          log.warn(`Session ${entry.record.name} unreachable ${entry.unreachableCount}x — marking dead`);
          await backend.stop(entry.record).catch((err) => log.warn(`stop(${entry.record.name}) failed`, err));
          this.entries.delete(uid);
        }
        continue;
      }

      entry.unreachableCount = 0;
      entry.lastActive = Math.max(entry.lastActive, Date.parse(activity.lastActivityAt) || 0);
      const idleMs = Date.now() - entry.lastActive;
      if (idleMs > config.hub.ttlSeconds * 1000 && !activity.busy) {
        log.info(`Reaping idle session ${entry.record.name} (idle ${Math.round(idleMs / 1000)}s)`);
        await backend.stop(entry.record).catch((err) => log.warn(`stop(${entry.record.name}) failed`, err));
        this.entries.delete(uid);
      }
    }
  }

  private async fetchActivity(record: SessionRecord): Promise<{ lastActivityAt: string; busy: boolean } | undefined> {
    try {
      const res = await fetch(`${record.internalUrl}/internal/activity`, {
        headers: { 'x-agb-internal': signInternalHeader() },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return undefined;
      return (await res.json()) as { lastActivityAt: string; busy: boolean };
    } catch {
      return undefined;
    }
  }

  /** Test hook: inject a fake backend and reset state. */
  _resetForTest(backend?: SessionBackend): void {
    this.stopReaper();
    this.entries.clear();
    this.inflight.clear();
    this.backendPromise = backend ? Promise.resolve(backend) : undefined;
  }

  /** Test hook: run one reaper pass without timers. */
  _reapOnceForTest(): Promise<void> {
    return this.reapTick();
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const sessionManager = new SessionManager();
