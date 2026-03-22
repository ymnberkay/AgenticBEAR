import { create } from 'zustand';
import type { SSEEvent } from '@subagent/shared';

interface RunStreamState {
  streamingRunId: string | null;
  streamingOutput: string;
  isStreaming: boolean;
  events: SSEEvent[];

  startStreaming: (runId: string) => void;
  appendChunk: (chunk: string) => void;
  pushEvent: (event: SSEEvent) => void;
  stopStreaming: () => void;
  clearOutput: () => void;
}

export const useRunStore = create<RunStreamState>((set) => ({
  streamingRunId: null,
  streamingOutput: '',
  isStreaming: false,
  events: [],

  startStreaming: (runId) =>
    set({
      streamingRunId: runId,
      streamingOutput: '',
      isStreaming: true,
      events: [],
    }),
  appendChunk: (chunk) =>
    set((state) => ({
      streamingOutput: state.streamingOutput + chunk,
    })),
  pushEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
    })),
  stopStreaming: () =>
    set({ isStreaming: false }),
  clearOutput: () =>
    set({
      streamingRunId: null,
      streamingOutput: '',
      isStreaming: false,
      events: [],
    }),
}));
