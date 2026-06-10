import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetRuntimeInstances } = vi.hoisted(() => ({
  mockGetRuntimeInstances: vi.fn(),
}));

vi.mock("./registry.js", () => ({
  getRuntimeInstances: (...args: unknown[]) => mockGetRuntimeInstances(...args),
}));

const { startAllRuntimes } = await import("./lifecycle.js");

describe("startAllRuntimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("starts all registered runtimes", async () => {
    const runtime1 = { start: vi.fn().mockResolvedValue(undefined) };
    const runtime2 = { start: vi.fn().mockResolvedValue(undefined) };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([
        ["agent", runtime1 as any],
        ["tool", runtime2 as any],
      ]),
    );

    await startAllRuntimes();

    expect(runtime1.start).toHaveBeenCalledOnce();
    expect(runtime2.start).toHaveBeenCalledOnce();
  });

  it("handles empty runtime map", async () => {
    mockGetRuntimeInstances.mockReturnValue(new Map());

    await startAllRuntimes();

    // No errors should be thrown
  });

  it("logs success message for each started runtime", async () => {
    const runtime = { start: vi.fn().mockResolvedValue(undefined) };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([["agent", runtime as any]]),
    );

    await startAllRuntimes();

    expect(console.log).toHaveBeenCalledWith('[Jarvis] Runtime "agent" started');
  });

  it("continues starting other runtimes when one fails", async () => {
    const failingRuntime = {
      start: vi.fn().mockRejectedValue(new Error("start failed")),
    };
    const successRuntime = {
      start: vi.fn().mockResolvedValue(undefined),
    };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([
        ["agent", failingRuntime as any],
        ["tool", successRuntime as any],
      ]),
    );

    await startAllRuntimes();

    expect(failingRuntime.start).toHaveBeenCalled();
    expect(successRuntime.start).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      '[Jarvis] Runtime "agent" failed to start:',
      expect.any(Error),
    );
  });

  it("logs error when a runtime start fails", async () => {
    const error = new Error("connection refused");
    const runtime = {
      start: vi.fn().mockRejectedValue(error),
    };
    mockGetRuntimeInstances.mockReturnValue(
      new Map([["voice", runtime as any]]),
    );

    await startAllRuntimes();

    expect(console.error).toHaveBeenCalledWith(
      '[Jarvis] Runtime "voice" failed to start:',
      error,
    );
  });
});
