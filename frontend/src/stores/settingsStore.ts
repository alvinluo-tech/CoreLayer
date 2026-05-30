import { create } from "zustand";
import * as tauri from "@/lib/tauri";

interface SettingsState {
  storageMode: "local" | "cloud" | "postgres";
  cloudConfigured: boolean;
  postgresConfigured: boolean;
  isLoading: boolean;
  error: string | null;
  dbStats: tauri.DbStats | null;
  isLoadingDbStats: boolean;
  fetchSettings: () => Promise<void>;
  setStorageMode: (mode: "local" | "cloud" | "postgres") => Promise<void>;
  fetchDbStats: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  storageMode: "local",
  cloudConfigured: false,
  postgresConfigured: false,
  isLoading: false,
  error: null,
  dbStats: null,
  isLoadingDbStats: false,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await tauri.getSettings();
      // Cast getSettings result fields
      const res = result as any;
      set({
        storageMode: res.storageMode as "local" | "cloud" | "postgres",
        cloudConfigured: res.cloudConfigured as boolean,
        postgresConfigured: res.postgresConfigured as boolean,
        isLoading: false,
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  setStorageMode: async (mode) => {
    set({ isLoading: true, error: null });
    try {
      await tauri.updateStorageMode(mode);
      set({ storageMode: mode, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  fetchDbStats: async () => {
    set({ isLoadingDbStats: true, error: null });
    try {
      const stats = await tauri.getDbStats();
      set({ dbStats: stats, isLoadingDbStats: false });
    } catch (error) {
      console.error("Failed to fetch db stats:", error);
      set({ error: String(error), isLoadingDbStats: false });
    }
  },
}));

