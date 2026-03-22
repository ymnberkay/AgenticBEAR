export type SSEEventType =
  | 'run:started'
  | 'run:completed'
  | 'run:failed'
  | 'run:paused'
  | 'run:cancelled'
  | 'task:created'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'step:started'
  | 'step:output_chunk'
  | 'step:completed'
  | 'file:changed'
  | 'tokens:updated';

export interface SSEEvent {
  type: SSEEventType;
  runId: string;
  data: Record<string, unknown>;
  timestamp: string;
}
