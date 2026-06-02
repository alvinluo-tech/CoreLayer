import { create } from 'zustand';
import type { DataViewSchema, RenderHint } from '@/types/dataView';

export interface DataPanelEntry {
  id: string;
  toolCallId: string;
  toolName: string;
  title: string;
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
  timestamp: number;
}

interface AddEntryInput {
  toolCallId: string;
  toolName: string;
  title: string;
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: RenderHint;
}

interface DataPanelState {
  entries: DataPanelEntry[];
  activeId: string | null;
  isVisible: boolean;
  dismissedAt: number | null;
  isMirrorMode: boolean;

  addEntry: (input: AddEntryInput) => void;
  dismiss: () => void;
  show: () => void;
  clearAll: () => void;
  setMirrorMode: (value: boolean) => void;
}

async function emitToDataPanelWindow(entry: DataPanelEntry) {
  try {
    const { emit } = await import('@tauri-apps/api/event');
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await emit('data-panel-entry', entry);
    const win = await WebviewWindow.getByLabel('data-panel');
    if (win) {
      await win.show().catch(() => {});
      await win.setFocus().catch(() => {});
    }
  } catch {
    // Not in Tauri environment or window not available
  }
}

export const useDataPanelStore = create<DataPanelState>((set, get) => ({
  entries: [],
  activeId: null,
  isVisible: false,
  dismissedAt: null,
  isMirrorMode: false,

  addEntry: (input) => {
    const id = input.toolCallId;
    const entry: DataPanelEntry = {
      id,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      title: input.title,
      data: input.data,
      schema: input.schema,
      renderHint: input.renderHint,
      timestamp: Date.now(),
    };

    set((state) => {
      const existingIndex = state.entries.findIndex((e) => e.toolCallId === id);
      const entries =
        existingIndex >= 0
          ? state.entries.map((e, i) => (i === existingIndex ? entry : e))
          : [...state.entries, entry];

      return { entries, activeId: id, isVisible: true, dismissedAt: null };
    });

    // In mirror mode, also pop up the data-panel window
    if (get().isMirrorMode) {
      emitToDataPanelWindow(entry);
    }
  },

  dismiss: () => {
    set({ isVisible: false, dismissedAt: Date.now() });
  },

  show: () => {
    const { entries } = get();
    if (entries.length > 0) {
      set({
        isVisible: true,
        dismissedAt: null,
        activeId: entries[entries.length - 1]?.id ?? null,
      });
    }
  },

  clearAll: () => {
    set({ entries: [], activeId: null, isVisible: false, dismissedAt: null });
  },

  setMirrorMode: (value) => {
    set({ isMirrorMode: value });
  },
}));
