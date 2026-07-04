/**
 * Session-pod activity signal for the hub's idle reaper. Tracks the last real request and the
 * number of open streams (SSE/chat); a pod is only reaped when idle past TTL *and* not busy.
 */
let lastActivityAt = Date.now();
let openStreams = 0;

export function markActivity(): void {
  lastActivityAt = Date.now();
}

export function markStreamOpen(): void {
  openStreams += 1;
}

export function markStreamClosed(): void {
  openStreams = Math.max(0, openStreams - 1);
  lastActivityAt = Date.now(); // closing a tab counts as activity; idle clock restarts
}

export function activitySnapshot(): { lastActivityAt: string; openStreams: number } {
  return { lastActivityAt: new Date(lastActivityAt).toISOString(), openStreams };
}
