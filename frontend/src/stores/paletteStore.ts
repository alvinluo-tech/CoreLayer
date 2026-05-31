import { create } from 'zustand';

interface PaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;

  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  moveUp: () => void;
  moveDown: () => void;
}

export const usePaletteStore = create<PaletteState>((set, get) => ({
  isOpen: false,
  query: '',
  selectedIndex: 0,

  open: () => set({ isOpen: true, query: '', selectedIndex: 0 }),
  close: () => set({ isOpen: false, query: '', selectedIndex: 0 }),
  toggle: () => {
    const { isOpen } = get();
    if (isOpen) {
      set({ isOpen: false, query: '', selectedIndex: 0 });
    } else {
      set({ isOpen: true, query: '', selectedIndex: 0 });
    }
  },
  setQuery: (query: string) => set({ query, selectedIndex: 0 }),
  setSelectedIndex: (index: number) => set({ selectedIndex: index }),
  moveUp: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: Math.max(0, selectedIndex - 1) });
  },
  moveDown: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: selectedIndex + 1 });
  },
}));
