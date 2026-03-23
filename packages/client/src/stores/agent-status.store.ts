import { create } from 'zustand';

export type AgentStatusType = 'idle' | 'running' | 'completed';

interface AgentStatusState {
  statuses: Record<string, AgentStatusType>;
  setStatus: (agentId: string, status: AgentStatusType) => void;
  resetAll: () => void;
}

export const useAgentStatusStore = create<AgentStatusState>((set) => ({
  statuses: {},
  setStatus: (agentId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [agentId]: status },
    })),
  resetAll: () => set({ statuses: {} }),
}));
