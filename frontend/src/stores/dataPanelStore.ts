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

let dataPanelWindowReady = false;

async function emitToDataPanelWindow(entry: DataPanelEntry) {
  try {
    const { emit, listen } = await import('@tauri-apps/api/event');
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    let win = await WebviewWindow.getByLabel('data-panel');

    if (!win) {
      // Dynamically create the window — webview will load and emit 'data-panel-ready'
      win = new WebviewWindow('data-panel', {
        url: 'index.html?data-panel=true',
        width: 500,
        height: 600,
        visible: false,
        decorations: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        transparent: true,
        center: true,
      });

      // Wait for the webview to mount and register its listener
      const unlistenReady = await listen('data-panel-ready', () => {
        dataPanelWindowReady = true;
      });
      // Give the webview time to load and emit ready
      await new Promise<void>((resolve) => {
        const check = () => {
          if (dataPanelWindowReady) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
        // Fallback: proceed after 2s regardless
        setTimeout(resolve, 2000);
      });
      unlistenReady();

      // Now show and emit
      await win.show().catch(() => {});
      await win.setFocus().catch(() => {});
      await emit('data-panel-entry', entry);
      return;
    }

    // Window already exists — listener is registered, just show and emit
    await win.show().catch(() => {});
    await win.setFocus().catch(() => {});
    await emit('data-panel-entry', entry);
  } catch (e) {
    console.warn('[DataPanelStore] Failed to emit to data-panel window:', e);
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
