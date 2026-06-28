/**
 * Per-model throttling — applied at the single inference choke-points (unified client +
 * tool client), so both the gateway and agentic paths obey the same limits.
 *
 *  - requestsPerSecond → token bucket (burst = the per-second rate).
 *  - maxConcurrent     → semaphore (caps in-flight calls for that model id).
 *  - timeoutMs         → surfaced via `modelTimeoutMs()`; the caller aborts the request.
 *
 * State is in-process (fine for a single replica; a multi-replica deploy would move this
 * to a shared store). Limits come from Settings.modelLimits, cached briefly to avoid a DB
 * read per call.
 */
import type { ModelLimit } from '@subagent/shared';
import { settingsRepo } from '../db/repositories/settings.repo.js';

interface Bucket { tokens: number; last: number }
interface Sema { active: number; queue: Array<() => void> }

const buckets = new Map<string, Bucket>();
const semaphores = new Map<string, Sema>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Settings cache (modelLimits) ──────────────────────────────────────────────
let cached: Record<string, ModelLimit> = {};
let cacheExpiry = 0;
const CACHE_TTL_MS = 3000;

async function limitFor(modelId: string): Promise<ModelLimit> {
  if (Date.now() >= cacheExpiry) {
    cached = (await settingsRepo.getSettings()).modelLimits ?? {};
    cacheExpiry = Date.now() + CACHE_TTL_MS;
  }
  return cached[modelId] ?? {};
}

/** Drop the cached limits (tests / immediately after a settings save). */
export function clearRateLimitCache(): void {
  cached = {};
  cacheExpiry = 0;
}

// ── Concurrency semaphore ─────────────────────────────────────────────────────
function acquireConcurrency(modelId: string, max: number): Promise<void> {
  let s = semaphores.get(modelId);
  if (!s) { s = { active: 0, queue: [] }; semaphores.set(modelId, s); }
  if (s.active < max) { s.active++; return Promise.resolve(); }
  return new Promise<void>((resolve) => s!.queue.push(resolve)).then(() => { s!.active++; });
}

function releaseConcurrency(modelId: string): void {
  const s = semaphores.get(modelId);
  if (!s) return;
  s.active = Math.max(0, s.active - 1);
  const next = s.queue.shift();
  if (next) next();
}

// ── Token bucket (requestsPerSecond) ──────────────────────────────────────────
async function throttleRate(modelId: string, rps: number): Promise<void> {
  const now = Date.now();
  let b = buckets.get(modelId);
  if (!b) { b = { tokens: rps, last: now }; buckets.set(modelId, b); }
  // Refill based on elapsed time, capped at the burst size (rps).
  b.tokens = Math.min(rps, b.tokens + ((now - b.last) / 1000) * rps);
  b.last = now;
  if (b.tokens >= 1) { b.tokens -= 1; return; }
  const waitMs = ((1 - b.tokens) / rps) * 1000;
  await sleep(waitMs);
  b.tokens = 0; // consumed the token we waited for
}

/**
 * Acquire a slot for `modelId` under the given limit. Returns a release fn (call after the
 * request finishes, success or error). Exported with an explicit limit for unit testing;
 * `acquire` resolves the limit from settings.
 */
export async function acquireSlot(modelId: string, limit: ModelLimit): Promise<() => void> {
  let released = false;
  const hasConcurrency = typeof limit.maxConcurrent === 'number' && limit.maxConcurrent > 0;
  if (hasConcurrency) await acquireConcurrency(modelId, limit.maxConcurrent!);
  if (typeof limit.requestsPerSecond === 'number' && limit.requestsPerSecond > 0) {
    await throttleRate(modelId, limit.requestsPerSecond);
  }
  return () => {
    if (released) return;
    released = true;
    if (hasConcurrency) releaseConcurrency(modelId);
  };
}

export async function acquire(modelId: string): Promise<() => void> {
  return acquireSlot(modelId, await limitFor(modelId));
}

/** The configured send-timeout (ms) for a model, or undefined if none. */
export async function modelTimeoutMs(modelId: string): Promise<number | undefined> {
  const limit = await limitFor(modelId);
  return typeof limit.timeoutMs === 'number' && limit.timeoutMs > 0 ? limit.timeoutMs : undefined;
}
