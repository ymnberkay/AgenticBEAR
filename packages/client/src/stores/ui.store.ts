import { create } from 'zustand';

type ModalType = 'create-project' | 'create-agent' | 'command-palette' | null;

interface UIState {
  projectNavCollapsed: boolean;
  gatewayNavCollapsed: boolean;
  activeModal: ModalType;
  commandPaletteOpen: boolean;

  toggleProjectNav: () => void;
  setProjectNavCollapsed: (collapsed: boolean) => void;
  toggleGatewayNav: () => void;
  setGatewayNavCollapsed: (collapsed: boolean) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  toggleCommandPalette: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  projectNavCollapsed: false,
  gatewayNavCollapsed: false,
  activeModal: null,
  commandPaletteOpen: false,

  toggleProjectNav: () =>
    set((state) => ({ projectNavCollapsed: !state.projectNavCollapsed })),
  setProjectNavCollapsed: (collapsed) => set({ projectNavCollapsed: collapsed }),
  toggleGatewayNav: () =>
    set((state) => ({ gatewayNavCollapsed: !state.gatewayNavCollapsed })),
  setGatewayNavCollapsed: (collapsed) => set({ gatewayNavCollapsed: collapsed }),
  openModal: (modal) =>
    set({ activeModal: modal, commandPaletteOpen: modal === 'command-palette' }),
  closeModal: () => set({ activeModal: null, commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((state) => ({
      commandPaletteOpen: !state.commandPaletteOpen,
      activeModal: !state.commandPaletteOpen ? 'command-palette' : null,
    })),
}));
