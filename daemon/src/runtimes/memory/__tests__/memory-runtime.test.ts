import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  MemoryRuntime,
  createMemoryRuntime,
} = await import("../memory-runtime.js");

const baseConfig = {
  id: "test-memory",
  kind: "memory" as const,
  version: "1.0.0",
  appDataPath: "/tmp/test-data",
  logPath: "/tmp/test-logs",
};

describe("MemoryRuntime", () => {
  let runtime: InstanceType<typeof MemoryRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new MemoryRuntime(baseConfig);
  });

  describe("class interface", () => {
    it("creates via factory function", () => {
      const instance = createMemoryRuntime(baseConfig);
      expect(instance).toBeInstanceOf(MemoryRuntime);
    });

    it("has all ManagedRuntime methods", () => {
      expect(typeof runtime.start).toBe("function");
      expect(typeof runtime.shutdown).toBe("function");
      expect(typeof runtime.getStatus).toBe("function");
      expect(typeof runtime.getInfo).toBe("function");
      expect(typeof runtime.getCapabilities).toBe("function");
      expect(typeof runtime.startRun).toBe("function");
      expect(typeof runtime.cancelRun).toBe("function");
      expect(typeof runtime.healthCheck).toBe("function");
      expect(typeof runtime.subscribeToEvents).toBe("function");
    });
  });

  describe("getInfo", () => {
    it("returns memory info", () => {
      const info = runtime.getInfo();
      expect(info.id).toBe("test-memory");
      expect(info.kind).toBe("memory");
      expect(info.version).toBe("1.0.0");
      expect(info.protocolVersion).toBe(1);
    });

    it("returns a copy", () => {
      const info1 = runtime.getInfo();
      const info2 = runtime.getInfo();
      expect(info1).not.toBe(info2);
    });
  });

  describe("getCapabilities", () => {
    it("returns memory-specific capabilities", () => {
      const caps = runtime.getCapabilities();
      expect(caps.capabilities).toContain("memory:store");
      expect(caps.capabilities).toContain("memory:retrieve");
      expect(caps.capabilities).toContain("memory:search");
      expect(caps.capabilities).toContain("memory:temporal");
      expect(caps.capabilities).toContain("memory:prune");
      expect(caps.supportedEvents).toContain("memory:stored");
      expect(caps.supportedEvents).toContain("memory:retrieved");
      expect(caps.supportedEvents).toContain("memory:pruned");
      expect(caps.maxConcurrentRuns).toBe(1);
    });
  });

  describe("getStatus", () => {
    it("returns zero uptime and no active runs", async () => {
      const status = await runtime.getStatus();
      expect(status.uptime).toBe(0);
      expect(status.activeRun).toBe(false);
      expect(status.completedRuns).toBe(0);
      expect(status.failedRuns).toBe(0);
    });

    it("includes runtime info", async () => {
      const status = await runtime.getStatus();
      expect(status.id).toBe("test-memory");
      expect(status.kind).toBe("memory");
    });
  });

  describe("startRun", () => {
    it("always starts (no concurrency tracking)", async () => {
      const result = await runtime.startRun({
        runId: "mem-1",
        input: {},
      });
      expect(result.status).toBe("started");
      expect(result.runId).toBe("mem-1");
    });
  });

  describe("cancelRun", () => {
    it("always returns not_found (no active tracking)", async () => {
      const result = await runtime.cancelRun({ runId: "mem-1" });
      expect(result.status).toBe("not_found");
    });
  });

  describe("shutdown", () => {
    it("sets health to unhealthy", async () => {
      await runtime.shutdown();
      const status = await runtime.getStatus();
      expect(status.health).toBe("unhealthy");
    });
  });

  describe("healthCheck", () => {
    it("sets health to healthy", async () => {
      const result = await runtime.healthCheck();
      expect(result).toBe(true);
      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
    });
  });

  describe("start", () => {
    it("initializes the runtime", async () => {
      await runtime.start();
      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it("sets startedAt", async () => {
      await runtime.start();
      const info = runtime.getInfo();
      expect(info.startedAt).toBeDefined();
    });
  });

  describe("subscribeToEvents", () => {
    it("returns an async iterable", () => {
      const events = runtime.subscribeToEvents();
      expect(events[Symbol.asyncIterator]).toBeDefined();
    });
  });

  describe("event emission", () => {
    it("emits runtime:started event on start", async () => {
      const events: Array<{ type: string }> = [];
      const iterator = runtime.subscribeToEvents()[Symbol.asyncIterator]();

      const collectPromise = (async () => {
        for (let i = 0; i < 3; i++) {
          try {
            const next = await Promise.race([
              iterator.next(),
              new Promise((r) => setTimeout(() => r({ done: true, value: undefined }), 100)),
            ]) as any;
            if (!next.done) events.push(next.value as { type: string });
          } catch {
            break;
          }
        }
      })();

      await runtime.start();
      await collectPromise;

      expect(events.some((e) => e.type === "runtime:started")).toBe(true);
    });
  });

  describe("custom config", () => {
    it("respects custom maxMemories config", () => {
      const custom = new MemoryRuntime({
        ...baseConfig,
        maxMemories: 100,
      });
      expect(custom).toBeInstanceOf(MemoryRuntime);
    });
  });
});
