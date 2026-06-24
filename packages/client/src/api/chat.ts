/** Streams a project chat reply (SSE) from POST /api/projects/:projectId/chat. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolEvent {
  kind: 'tool' | 'toolResult' | 'write' | 'delegate';
  name?: string;
  path?: string;
  operation?: string;
  agent?: string;
  task?: string;
  summary?: string;
}

interface StreamHandlers {
  onDelta?: (text: string) => void;
  onTool?: (e: ToolEvent) => void;
  onDone?: (info: { servedModel?: string; filesWritten?: number }) => void;
  onError?: (message: string) => void;
}

export async function streamChat(
  projectId: string,
  agentId: string,
  messages: ChatMessage[],
  handlers: StreamHandlers,
): Promise<void> {
  let res: Response;
  try {
    const token = localStorage.getItem('agb_token');
    res = await fetch(`/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ agentId, messages }),
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
          delta?: string; done?: boolean; error?: string; servedModel?: string; filesWritten?: number;
          tool?: { name: string; args: unknown };
          toolResult?: { name: string; summary: string };
          write?: { path: string; operation: string };
          delegate?: { agent: string; task: string };
        };
        if (obj.error) handlers.onError?.(obj.error);
        else if (obj.delta) handlers.onDelta?.(obj.delta);
        else if (obj.tool) handlers.onTool?.({ kind: 'tool', name: obj.tool.name });
        else if (obj.toolResult) handlers.onTool?.({ kind: 'toolResult', name: obj.toolResult.name, summary: obj.toolResult.summary });
        else if (obj.write) handlers.onTool?.({ kind: 'write', path: obj.write.path, operation: obj.write.operation });
        else if (obj.delegate) handlers.onTool?.({ kind: 'delegate', agent: obj.delegate.agent, task: obj.delegate.task });
        else if (obj.done) handlers.onDone?.({ servedModel: obj.servedModel, filesWritten: obj.filesWritten });
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
