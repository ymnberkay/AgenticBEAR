/**
 * Per-API-key request throttling for the gateway — an in-memory sliding window keyed by gateway
 * key id (single-replica; a multi-replica deploy would move this to a shared store). The monthly
 * USD budget is enforced separately in the gateway auth middleware via the usage repo.
 */
const WINDOW_MS = 60_000;
const windows = new Map<string, number[]>(); // keyId → request timestamps (ms) within the last minute

/** True if the request is within the key's per-minute limit (and records it); false if it exceeds. */
export function allowGatewayKeyRequest(keyId: string, perMin: number | null): boolean {
  if (!perMin || perMin <= 0) return true; // unlimited
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const hits = (windows.get(keyId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= perMin) {
    windows.set(keyId, hits); // keep the pruned window
    return false;
  }
  hits.push(now);
  windows.set(keyId, hits);
  return true;
}

/** Test/maintenance hook: clear all in-memory rate-limit windows. */
export function clearGatewayKeyWindows(): void {
  windows.clear();
}
