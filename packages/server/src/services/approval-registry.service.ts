/**
 * In-memory registry for interactive (human-in-the-loop) tool approvals.
 *
 * The chat SSE turn stays open and calls `awaitApproval(callId)` when a destructive tool needs the
 * user's go-ahead; a separate `POST …/chat/approvals/:callId` request calls `resolveApproval` to
 * unblock it. Single-replica (like the gateway rate-limiter); a multi-replica deploy would move
 * this to a shared store. Every pending approval has a timeout so a dropped client never hangs the
 * loop forever, and the SSE handler rejects its own pending calls on socket close.
 */
import type { ApprovalDecision } from './agent-loop.service.js';

interface Pending {
  resolve: (d: ApprovalDecision) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();

/** Register a pending approval and return a promise that resolves when the user decides (or times out). */
export function awaitApproval(callId: string, timeoutMs: number): Promise<ApprovalDecision> {
  return new Promise<ApprovalDecision>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(callId);
      resolve({ approved: false, timedOut: true });
    }, timeoutMs);
    // Don't keep the event loop alive just for this timer.
    if (typeof timer.unref === 'function') timer.unref();
    pending.set(callId, { resolve, timer });
  });
}

/** Resolve a pending approval (from the decision endpoint). Returns false if it's unknown/expired. */
export function resolveApproval(callId: string, decision: ApprovalDecision): boolean {
  const entry = pending.get(callId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(callId);
  entry.resolve(decision);
  return true;
}

/** Auto-reject a set of pending approvals (e.g. the SSE client disconnected). */
export function rejectApprovals(callIds: Iterable<string>): void {
  for (const id of callIds) resolveApproval(id, { approved: false });
}
