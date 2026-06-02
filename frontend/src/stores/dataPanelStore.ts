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

    const win = await WebviewWindow.getByLabel('data-panel');
    if (!win) return;

    // Show window first so the webview loads and registers its listener
    await win.show().catch(() => {});
    await win.setFocus().catch(() => {});

    // Wait for the webview to signal it's ready, then emit data
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen('data-panel-ready', async () => {
      unlisten();
      await emit('data-panel-entry', entry);
    });

    // If the window was already loaded (second call), emit immediately after a short delay
    // The ready event from an already-loaded window fires very fast
    // As a fallback, also emit after 500ms in case ready event was missed
    setTimeout(async () => {
      unlisten();
      await emit('data-panel-entry', entry);
    }, 500);
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
