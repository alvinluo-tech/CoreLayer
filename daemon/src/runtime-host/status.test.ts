import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockGetRuntimeInstances,
  mockResolveAppPaths,
} = vi.hoisted(() => ({
  mockGetRuntimeInstances: vi.fn(),
  mockResolveAppPaths: vi.fn(),
}));

vi.mock("./registry.js", () => ({
  getRuntimeInstances: (...args: unknown[]) => mockGetRuntimeInstances(...args),
}));

vi.mock("../config/app-paths.js", () => ({
  resolveAppPaths: (...args: unknown[]) => mockResolveAppPaths(...args),
}));

const { buildRuntimeComponents } = await import("./status.js");

describe("buildRuntimeComponents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAppPaths.mockReturnValue({ logDir: "/tmp/test/logs" });
  });

  it("returns all runtime kinds with pending status when none registered", async () => {
    mockGetRuntimeInstances.mockReturnValue(new Map());

    const components = await buildRuntimeComponents();

    expect(components).toHaveLength(7);
    for (const comp of components) {
      expect(comp.status).toBe("pending");
      expect(comp.pid).toBeUndefined();
    }
  });

  it("returns running status for healthy runtime", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockResolvedValue({ health: "healthy", lastError: undefined }),
    };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([["agent", mockRuntime as any]]),
    );

    const components = await buildRuntimeComponents();
    const agent = components.find((c) => c.kind === "agent");

    expect(agent).toBeDefined();
    expect(agent!.status).toBe("running");
    expect(agent!.pid).toBe(process.pid);
  });

  it("returns degraded status for degraded runtime", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockResolvedValue({ health: "degraded", lastError: "slow response" }),
    };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([["voice", mockRuntime as any]]),
    );

    const components = await buildRuntimeComponents();
    const voice = components.find((c) => c.kind === "voice");

    expect(voice!.status).toBe("degraded");
    expect(voice!.lastError).toBe("slow response");
  });

  it("returns failed status for unhealthy runtime", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockResolvedValue({ health: "failed", lastError: "crash" }),
    };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([["coding", mockRuntime as any]]),
    );

    const components = await buildRuntimeComponents();
    const coding = components.find((c) => c.kind === "coding");

    expect(coding!.status).toBe("failed");
    expect(coding!.lastError).toBe("crash");
  });

  it("returns failed status when getStatus throws", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockRejectedValue(new Error("connection lost")),
    };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([["scheduler", mockRuntime as any]]),
    );

    const components = await buildRuntimeComponents();
    const scheduler = components.find((c) => c.kind === "scheduler");

    expect(scheduler!.status).toBe("failed");
    expect(scheduler!.lastError).toBe("connection lost");
  });

  it("handles non-Error thrown values", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockRejectedValue("string error"),
    };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([["tool", mockRuntime as any]]),
    );

    const components = await buildRuntimeComponents();
    const tool = components.find((c) => c.kind === "tool");

    expect(tool!.status).toBe("failed");
    expect(tool!.lastError).toBe("string error");
  });

  it("includes logPath and restart policy for all components", async () => {
    mockGetRuntimeInstances.mockReturnValue(new Map());

    const components = await buildRuntimeComponents();

    for (const comp of components) {
      expect(comp.logPath).toBe("/tmp/test/logs");
      expect(comp.restartPolicy).toEqual({ type: "maxAttempts", maxAttempts: 3 });
    }
  });

  it("unregistered runtimes have no pid", async () => {
    mockGetRuntimeInstances.mockReturnValue(new Map());

    const components = await buildRuntimeComponents();

    for (const comp of components) {
      expect(comp.pid).toBeUndefined();
    }
  });
});
