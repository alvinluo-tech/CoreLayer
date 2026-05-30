import { describe, it, expect, beforeEach, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@/lib/tauri", () => ({
  getSettings: (...args: unknown[]) => mockInvoke("getSettings", ...args),
  updateStorageMode: (...args: unknown[]) => mockInvoke("updateStorageMode", ...args),
  getDbStats: (...args: unknown[]) => mockInvoke("getDbStats", ...args),
}));

import { useSettingsStore } from "./settingsStore";

beforeEach(() => {
  mockInvoke.mockReset();
  useSettingsStore.setState({
    storageMode: "local",
    cloudConfigured: false,
    postgresConfigured: false,
    isLoading: false,
    error: null,
    dbStats: null,
    isLoadingDbStats: false,
  });
});

describe("useSettingsStore", () => {
  describe("fetchSettings", () => {
    it("populates settings on success", async () => {
      mockInvoke.mockResolvedValueOnce({
        storageMode: "cloud",
        cloudConfigured: true,
        postgresConfigured: false,
      });

      await useSettingsStore.getState().fetchSettings();

      const state = useSettingsStore.getState();
      expect(state.storageMode).toBe("cloud");
      expect(state.cloudConfigured).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error on failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("settings fetch failed"));

      await useSettingsStore.getState().fetchSettings();

      const state = useSettingsStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe("Error: settings fetch failed");
    });
  });

  describe("setStorageMode", () => {
    it("updates storage mode on success", async () => {
      mockInvoke.mockResolvedValueOnce({ storageMode: "postgres", message: "ok" });

      await useSettingsStore.getState().setStorageMode("postgres");

      const state = useSettingsStore.getState();
      expect(state.storageMode).toBe("postgres");
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error on failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("mode update failed"));

      await useSettingsStore.getState().setStorageMode("cloud");

      const state = useSettingsStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe("Error: mode update failed");
    });
  });
});
