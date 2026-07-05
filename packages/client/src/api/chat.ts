/** Streams a project chat reply (SSE) from POST /api/projects/:projectId/chat. */
import { apiUrl, apiFetch } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Image attachment sent alongside the CURRENT user message (external agents with vision). */
export interface ChatImage {
  dataUrl: string;
  name?: string;
}

/** Audio clip (mic recording / audio file) sent alongside the CURRENT user message. */
export interface ChatAudio {
  dataUrl: string;
  name?: string;
}

/** Video clip sent alongside the CURRENT user message (external agents with supportsVideo). */
export interface ChatVideo {
  dataUrl: string;
  name?: string;
}

export interface ToolEvent {
  kind: 'tool' | 'toolResult' | 'write' | 'delegate' | 'pendingWrite';
  name?: string;
  path?: string;
  operation?: string;
  agent?: string;
  task?: string;
  summary?: string;
  /** For run_command — the actual shell command, so the UI can show what's running. */
  command?: string;
}

/** A chat-staged file op awaiting the user's Approve/Reject (id known only after the turn). */
export interface PendingChange {
  id: string;
  path: string;
  operation: string;
}

/** A destructive tool call paused mid-turn, awaiting the user's live Approve/Reject. */
export interface ApprovalRequest {
  callId: string;
  tool: string;
  operation: string;
  /** Human-readable summary, e.g. "run: npm test" or "write src/app.ts (120 chars)". */
  label: string;
  command?: string;
  path?: string;
  contentPreview?: string;
}

interface StreamHandlers {
  onDelta?: (text: string) => void;
  onTool?: (e: ToolEvent) => void;
  onPending?: (p: PendingChange) => void;
  /** A destructive tool is paused; show Approve/Reject and call `sendApprovalDecision`. */
  onApprovalRequest?: (r: ApprovalRequest) => void;
  /** The pause was resolved (by the user or a timeout) — clear the prompt. */
  onApprovalResolved?: (callId: string, approved: boolean) => void;
  onDone?: (info: { servedModel?: string; filesWritten?: number; pending?: number }) => void;
  onError?: (message: string) => void;
}

/** Post the user's Approve/Reject for a paused tool call, unblocking the open chat turn. */
export async function sendApprovalDecision(projectId: string, callId: string, approved: boolean): Promise<void> {
  const token = localStorage.getItem('agb_token');
  await fetch(apiUrl(`/api/projects/${projectId}/chat/approvals/${callId}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ approved }),
  });
}

export async function streamChat(
  projectId: string,
  agentId: string,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  opts: { images?: ChatImage[]; audio?: ChatAudio[]; video?: ChatVideo[] } = {},
): Promise<void> {
  let res: Response;
  try {
    const token = localStorage.getItem('agb_token');
    res = await apiFetch(`/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        agentId, messages,
        ...(opts.images && opts.images.length > 0 ? { images: opts.images } : {}),
        ...(opts.audio && opts.audio.length > 0 ? { audio: opts.audio } : {}),
        ...(opts.video && opts.video.length > 0 ? { video: opts.video } : {}),
      }),
    });
  } catch (e) {
    handlers.onError?.(e instanceof Error ? e.message : 'network error');
    return;
  }
  if (!res.ok || !res.body) {
    handlers.onError?.(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const obj = JSON.parse(payload) as {
          delta?: string; done?: boolean; error?: string | { message: string }; servedModel?: string; filesWritten?: number;
          tool?: { name: string; args?: { command?: string } };
          toolResult?: { name: string; summary: string };
          write?: { path: string; operation: string };
          pendingWrite?: { path: string; operation: string };
          pending?: { id: string; path: string; operation: string } | number;
          delegate?: { agent: string; task: string };
          approvalRequest?: ApprovalRequest;
          approvalResolved?: { callId: string; approved: boolean };
        };
        if (obj.error) handlers.onError?.(typeof obj.error === 'string' ? obj.error : (obj.error.message ?? 'Unknown error'));
        else if (obj.delta) handlers.onDelta?.(obj.delta);
        else if (obj.approvalRequest) handlers.onApprovalRequest?.(obj.approvalRequest);
        else if (obj.approvalResolved) handlers.onApprovalResolved?.(obj.approvalResolved.callId, obj.approvalResolved.approved);
        else if (obj.tool) handlers.onTool?.({ kind: 'tool', name: obj.tool.name, command: obj.tool.args?.command });
        else if (obj.toolResult) handlers.onTool?.({ kind: 'toolResult', name: obj.toolResult.name, summary: obj.toolResult.summary });
        else if (obj.write) handlers.onTool?.({ kind: 'write', path: obj.write.path, operation: obj.write.operation });
        else if (obj.pendingWrite) handlers.onTool?.({ kind: 'pendingWrite', path: obj.pendingWrite.path, operation: obj.pendingWrite.operation });
        else if (obj.pending && typeof obj.pending === 'object') handlers.onPending?.(obj.pending);
        else if (obj.delegate) handlers.onTool?.({ kind: 'delegate', agent: obj.delegate.agent, task: obj.delegate.task });
        else if (obj.done) handlers.onDone?.({ servedModel: obj.servedModel, filesWritten: obj.filesWritten, pending: typeof obj.pending === 'number' ? obj.pending : undefined });
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
