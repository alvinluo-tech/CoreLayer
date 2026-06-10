import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStatSync = vi.fn();

vi.mock("node:fs", () => ({
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

const { createConfigSensor, createDefaultConfigSensor } = await import("./config-sensor.js");

describe("config-sensor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createConfigSensor", () => {
    it("has correct name and default interval", () => {
      const sensor = createConfigSensor({ paths: ["/a.json"] });
      expect(sensor.name).toBe("config");
      expect(sensor.interval).toBe(30_000);
    });

    it("uses custom interval", () => {
      const sensor = createConfigSensor({ paths: ["/a.json"], intervalMs: 5000 });
      expect(sensor.interval).toBe(5000);
    });

    it("returns null on first check (initialization pass)", async () => {
      mockStatSync.mockReturnValue({ mtimeMs: 1000 });
      const sensor = createConfigSensor({ paths: ["/a.json"] });

      const changes = await sensor.check();
      expect(changes).toBeNull();
    });

    it("returns null when no files changed", async () => {
      mockStatSync.mockReturnValue({ mtimeMs: 1000 });
      const sensor = createConfigSensor({ paths: ["/a.json"] });

      await sensor.check(); // initialize
      const changes = await sensor.check(); // no change

      expect(changes).toBeNull();
    });

    it("detects file modification", async () => {
      const sensor = createConfigSensor({ paths: ["/a.json"] });

      mockStatSync.mockReturnValue({ mtimeMs: 1000 });
      await sensor.check(); // initialize

      mockStatSync.mockReturnValue({ mtimeMs: 2000 });
      const changes = await sensor.check();

      expect(changes).toEqual([
        { type: "config_file_modified", detail: "/a.json modified" },
      ]);
    });

    it("detects changes in multiple files", async () => {
      const sensor = createConfigSensor({ paths: ["/a.json", "/b.json"] });

      mockStatSync.mockReturnValue({ mtimeMs: 1000 });
      await sensor.check(); // initialize

      mockStatSync.mockImplementation((path: string) => ({
        mtimeMs: path === "/a.json" ? 2000 : 1000,
      }));
      const changes = await sensor.check();

      expect(changes).toHaveLength(1);
      expect(changes![0].detail).toContain("/a.json");
    });

    it("skips files that cannot be stat'd", async () => {
      const sensor = createConfigSensor({ paths: ["/missing.json", "/a.json"] });

      mockStatSync.mockImplementation((path: string) => {
        if (path === "/missing.json") return undefined;
        return { mtimeMs: 1000 };
      });
      await sensor.check(); // initialize

      mockStatSync.mockImplementation((path: string) => {
        if (path === "/missing.json") return undefined;
        return { mtimeMs: 2000 };
      });
      const changes = await sensor.check();

      expect(changes).toEqual([
        { type: "config_file_modified", detail: "/a.json modified" },
      ]);
    });

    it("handles statSync throwing an error", async () => {
      const sensor = createConfigSensor({ paths: ["/bad.json"] });

      mockStatSync.mockImplementation(() => {
        throw new Error("permission denied");
      });
      const changes = await sensor.check();

      expect(changes).toBeNull();
    });

    it("handles multiple paths with mixed states", async () => {
      const sensor = createConfigSensor({ paths: ["/a.json", "/b.json", "/c.json"] });

      mockStatSync.mockReturnValue({ mtimeMs: 1000 });
      await sensor.check(); // initialize

      mockStatSync.mockImplementation((path: string) => {
        if (path === "/a.json") return { mtimeMs: 2000 }; // changed
        if (path === "/b.json") return undefined; // missing
        return { mtimeMs: 1000 }; // unchanged
      });
      const changes = await sensor.check();

      expect(changes).toEqual([
        { type: "config_file_modified", detail: "/a.json modified" },
      ]);
    });
  });

  describe("createDefaultConfigSensor", () => {
    it("creates a sensor with default name and interval", () => {
      const sensor = createDefaultConfigSensor();
      expect(sensor.name).toBe("config");
      expect(sensor.interval).toBe(30_000);
    });
  });
});
