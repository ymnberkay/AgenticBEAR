import { describe, it, expect, vi } from 'vitest';
import { acquireSlot } from '../rate-limiter.service.js';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('rate-limiter — acquireSlot', () => {
  it('no limits → resolves immediately with a no-op release', async () => {
    const release = await acquireSlot('m-none', {});
    expect(typeof release).toBe('function');
    release();
    release(); // idempotent
  });

  it('maxConcurrent caps in-flight calls; release lets the next through', async () => {
    const rel1 = await acquireSlot('m-conc', { maxConcurrent: 1 });
    let secondGotIn = false;
    const p2 = acquireSlot('m-conc', { maxConcurrent: 1 }).then((r) => { secondGotIn = true; return r; });

    await tick();
    expect(secondGotIn).toBe(false); // blocked while slot 1 is held

    rel1();
    const rel2 = await p2;
    expect(secondGotIn).toBe(true);
    rel2();
  });

  it('requestsPerSecond throttles once the burst is spent', async () => {
    vi.useFakeTimers();
    try {
      // Bucket starts full at rps=1 → first acquire consumes the only token.
      const r1 = await acquireSlot('m-rps', { requestsPerSecond: 1 });
      r1();

      let secondDone = false;
      const p = acquireSlot('m-rps', { requestsPerSecond: 1 }).then((r) => { secondDone = true; return r; });
      await Promise.resolve();
      expect(secondDone).toBe(false); // must wait ~1s for a refill

      await vi.advanceTimersByTimeAsync(1000);
      const r2 = await p;
      expect(secondDone).toBe(true);
      r2();
    } finally {
      vi.useRealTimers();
    }
  });
});
