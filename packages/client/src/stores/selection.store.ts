import { create } from 'zustand';

interface SelectionState {
  selectedProjectId: string | null;
  selectedAgentId: string | null;
  selectedTaskId: string | null;
  selectedRunId: string | null;

  selectProject: (id: string | null) => void;
  selectAgent: (id: string | null) => void;
  selectTask: (id: string | null) => void;
  selectRun: (id: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedProjectId: null,
  selectedAgentId: null,
  selectedTaskId: null,
  selectedRunId: null,

  selectProject: (id) =>
    set({
      selectedProjectId: id,
      selectedAgentId: null,
      selectedTaskId: null,
      selectedRunId: null,
    }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  selectRun: (id) => set({ selectedRunId: id }),
  clearSelection: () =>
    set({
      selectedProjectId: null,
      selectedAgentId: null,
      selectedTaskId: null,
      selectedRunId: null,
    }),
}));
