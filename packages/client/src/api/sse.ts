import type { SSEEvent, SSEEventType } from '@subagent/shared';

type SSEEventHandler = (event: SSEEvent) => void;

export interface SSEConnection {
  addEventListener: (type: SSEEventType | 'message', handler: SSEEventHandler) => void;
  removeEventListener: (type: SSEEventType | 'message', handler: SSEEventHandler) => void;
  close: () => void;
}

export function createSSEConnection(runId: string): SSEConnection {
  const eventSource = new EventSource(`/api/events/${runId}`);
  const handlers = new Map<string, Set<SSEEventHandler>>();

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as SSEEvent;
      const typeHandlers = handlers.get(data.type);
      typeHandlers?.forEach((handler) => handler(data));

      const messageHandlers = handlers.get('message');
      messageHandlers?.forEach((handler) => handler(data));
    } catch {
      // Ignore malformed events
    }
  };

  eventSource.onerror = () => {
    // EventSource will auto-reconnect
  };

  return {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    close() {
      eventSource.close();
      handlers.clear();
    },
  };
}
