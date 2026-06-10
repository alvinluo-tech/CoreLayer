import { describe, it, expect, beforeEach, vi } from "vitest";

describe("registry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts with empty runtime instances", async () => {
    const { getRuntimeInstances } = await import("./registry.js");
    const instances = getRuntimeInstances();
    expect(instances.size).toBe(0);
  });

  it("registers a runtime instance", async () => {
    const { registerRuntime, getRuntimeInstances } = await import("./registry.js");
    const mockRuntime = { start: vi.fn(), getStatus: vi.fn() } as any;

    registerRuntime("agent", mockRuntime);

    const instances = getRuntimeInstances();
    expect(instances.size).toBe(1);
    expect(instances.get("agent")).toBe(mockRuntime);
  });

  it("retrieves a registered runtime by kind", async () => {
    const { registerRuntime, getRuntimeInstance } = await import("./registry.js");
    const mockRuntime = { start: vi.fn() } as any;

    registerRuntime("tool", mockRuntime);

    expect(getRuntimeInstance("tool")).toBe(mockRuntime);
  });

  it("returns undefined for unregistered kind", async () => {
    const { getRuntimeInstance } = await import("./registry.js");

    expect(getRuntimeInstance("voice")).toBeUndefined();
  });

  it("overwrites existing runtime for same kind", async () => {
    const { registerRuntime, getRuntimeInstance } = await import("./registry.js");
    const first = { start: vi.fn() } as any;
    const second = { start: vi.fn() } as any;

    registerRuntime("agent", first);
    registerRuntime("agent", second);

    expect(getRuntimeInstance("agent")).toBe(second);
  });

  it("registers multiple different runtime kinds", async () => {
    const { registerRuntime, getRuntimeInstances } = await import("./registry.js");
    const agent = { start: vi.fn() } as any;
    const tool = { start: vi.fn() } as any;
    const coding = { start: vi.fn() } as any;

    registerRuntime("agent", agent);
    registerRuntime("tool", tool);
    registerRuntime("coding", coding);

    const instances = getRuntimeInstances();
    expect(instances.size).toBe(3);
    expect(instances.get("agent")).toBe(agent);
    expect(instances.get("tool")).toBe(tool);
    expect(instances.get("coding")).toBe(coding);
  });

  it("getRuntimeInstances returns the same Map reference", async () => {
    const { getRuntimeInstances } = await import("./registry.js");

    const map1 = getRuntimeInstances();
    const map2 = getRuntimeInstances();

    expect(map1).toBe(map2);
  });
});
