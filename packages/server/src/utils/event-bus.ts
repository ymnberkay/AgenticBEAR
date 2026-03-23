import { EventEmitter } from 'node:events';
import type { SSEEvent, SSEEventType } from '@subagent/shared';

class RunEventBus extends EventEmitter {
  emitRunEvent(event: SSEEvent): void {
    this.emit(`run:${event.runId}`, event);
    this.emit('*', event);
  }

  createEvent(type: SSEEventType, runId: string, data: Record<string, unknown>): SSEEvent {
    return {
      type,
      runId,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  emitAndCreate(type: SSEEventType, runId: string, data: Record<string, unknown>): void {
    this.emitRunEvent(this.createEvent(type, runId, data));
  }

  /** Proje bazli event — MCP activity vs. icin */
  emitProjectEvent(projectId: string, data: Record<string, unknown>): void {
    this.emit(`project:${projectId}`, data);
  }
}

// Global singleton
export const eventBus = new RunEventBus();
eventBus.setMaxListeners(100);
