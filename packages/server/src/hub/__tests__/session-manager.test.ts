import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sessionManager } from '../session-manager.js';
import type { SessionBackend, SessionRecord, SessionUser } from '../backends/types.js';
import { userHash, sessionName, usernameSlug } from '../backends/types.js';

const asUser = (uid: string): SessionUser => ({ id: uid, username: uid });

function record(uid: string): SessionRecord {
  return {
    uid,
    username: uid,
    name: sessionName(asUser(uid)),
    hash: userHash(uid),
    internalUrl: `http://session-${uid}.test`,
    publicBaseUrl: `/u/${userHash(uid)}`,
  };
}

class FakeBackend implements SessionBackend {
  started: string[] = [];
  stopped: string[] = [];
  existing: SessionRecord[] = [];
  async start(user: SessionUser): Promise<SessionRecord> {
    this.started.push(user.id);
    return record(user.id);
  }
  async stop(rec: SessionRecord): Promise<void> {
    this.stopped.push(rec.uid);
  }
  async list(): Promise<SessionRecord[]> {
    return this.existing;
  }
}

/** fetch stub: /api/health per-host health, /internal/activity per-host activity payloads. */
function stubFetch(opts: {
  healthy?: (url: string) => boolean;
  activity?: (url: string) => { lastActivityAt: string; busy: boolean } | undefined;
}) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith('/api/health')) {
      return new Response('{}', { status: opts.healthy?.(url) === false ? 503 : 200 });
    }
    if (url.endsWith('/internal/activity')) {
      const body = opts.activity?.(url);
      if (!body) throw new Error('unreachable');
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe('sessionManager', () => {
  let backend: FakeBackend;

  beforeEach(() => {
    backend = new FakeBackend();
    sessionManager._resetForTest(backend);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionManager._resetForTest();
  });

  it('ensureSession provisions once and reports ready', async () => {
    vi.stubGlobal('fetch', stubFetch({}));
    const info = await sessionManager.ensureSession(asUser('user-1'));
    expect(info.status).toBe('ready');
    expect(info.baseUrl).toBe(`/u/${userHash('user-1')}`);
    expect(backend.started).toEqual(['user-1']);
  });

  it('concurrent ensureSession calls single-flight into one provisioning', async () => {
    vi.stubGlobal('fetch', stubFetch({}));
    const [a, b, c] = await Promise.all([
      sessionManager.ensureSession(asUser('user-1')),
      sessionManager.ensureSession(asUser('user-1')),
      sessionManager.ensureSession(asUser('user-1')),
    ]);
    expect(a.status).toBe('ready');
    expect(b.status).toBe('ready');
    expect(c.status).toBe('ready');
    expect(backend.started).toEqual(['user-1']);
  });

  it('getStatus is none before provisioning, with a deterministic baseUrl', () => {
    const info = sessionManager.getStatus('user-2');
    expect(info.status).toBe('none');
    expect(info.baseUrl).toBe(`/u/${userHash('user-2')}`);
  });

  it('reaper skips busy sessions and reaps idle ones', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        activity: (url) => {
          const old = new Date(Date.now() - 3 * 3600_000).toISOString();
          if (url.includes('busy-user')) return { lastActivityAt: old, busy: true };
          return { lastActivityAt: old, busy: false };
        },
      }),
    );
    await sessionManager.ensureSession(asUser('busy-user'));
    await sessionManager.ensureSession(asUser('idle-user'));
    // Backdate both entries past the TTL (default 1800s)
    for (const uid of ['busy-user', 'idle-user']) {
      const entry = (sessionManager as unknown as { entries: Map<string, { lastActive: number }> }).entries.get(uid)!;
      entry.lastActive = Date.now() - 3 * 3600_000;
    }
    await sessionManager._reapOnceForTest();
    expect(backend.stopped).toEqual(['idle-user']);
    expect(sessionManager.getStatus('busy-user').status).toBe('ready');
    expect(sessionManager.getStatus('idle-user').status).toBe('none');
  });

  it('marks a session dead after consecutive unreachable polls', async () => {
    let reachable = true;
    vi.stubGlobal(
      'fetch',
      stubFetch({ activity: () => (reachable ? { lastActivityAt: new Date().toISOString(), busy: false } : undefined) }),
    );
    await sessionManager.ensureSession(asUser('user-1'));
    reachable = false;
    await sessionManager._reapOnceForTest(); // 1st failure — tolerated
    expect(sessionManager.getStatus('user-1').status).toBe('ready');
    await sessionManager._reapOnceForTest(); // 2nd failure — dead
    expect(sessionManager.getStatus('user-1').status).toBe('none');
    expect(backend.stopped).toEqual(['user-1']);
  });

  it('wake after out-of-band pod deletion re-provisions instead of trusting stale ready state', async () => {
    let alive = true;
    vi.stubGlobal('fetch', stubFetch({ healthy: () => alive }));
    await sessionManager.ensureSession(asUser('user-1'));
    expect(backend.started).toEqual(['user-1']);

    alive = false; // kubectl delete pod / eviction — registry still says ready
    const wakePromise = sessionManager.ensureSession(asUser('user-1'));
    alive = true; // backend.start "recreates" the pod; health starts passing again
    const info = await wakePromise;
    expect(info.status).toBe('ready');
    expect(backend.started).toEqual(['user-1', 'user-1']); // re-provisioned
  });

  it('reconcile adopts healthy existing sessions', async () => {
    backend.existing = [record('user-a'), record('user-b')];
    vi.stubGlobal('fetch', stubFetch({}));
    await sessionManager.reconcile();
    expect(sessionManager.getStatus('user-a').status).toBe('ready');
    expect(sessionManager.getStatus('user-b').status).toBe('ready');
    expect(backend.started).toEqual([]); // adopted, not recreated
  });

  it('session names are readable for DNS-safe usernames and unique otherwise', () => {
    expect(sessionName({ id: 'x1', username: 'admin' })).toBe('agb-session-admin');
    expect(sessionName({ id: 'x2', username: 'berkay-dev' })).toBe('agb-session-berkay-dev');
    // Sanitized usernames get a uid-hash suffix so "user_a" and "user.a" can't collide
    const a = sessionName({ id: 'id-a', username: 'user_a' });
    const b = sessionName({ id: 'id-b', username: 'user.a' });
    expect(a).toMatch(/^agb-session-user-a-[0-9a-f]{6}$/);
    expect(b).toMatch(/^agb-session-user-a-[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
    expect(usernameSlug('Berkay Yaman')).toBe('berkay-yaman');
  });
});
