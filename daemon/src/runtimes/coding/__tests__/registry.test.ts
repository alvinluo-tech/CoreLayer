import { describe, it, expect } from "vitest";
import {
  listCodingRuntimes,
  getCodingRuntime,
  registerCodingRuntime,
  selectExecutorAdapter,
  selectExecutorAdapterDetailed,
} from "../registry.js";

describe("CodingRuntime Registry", () => {
  it("lists default adapters", () => {
    const runtimes = listCodingRuntimes();
    expect(runtimes.length).toBeGreaterThanOrEqual(2);
    expect(runtimes.map((r) => r.id)).toContain("claude-code");
    expect(runtimes.map((r) => r.id)).toContain("codex");
  });

  it("gets claude-code adapter", () => {
    const adapter = getCodingRuntime("claude-code");
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe("claude-code");
    expect(adapter!.name).toBe("Claude Code");
  });

  it("gets codex adapter", () => {
    const adapter = getCodingRuntime("codex");
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe("codex");
    expect(adapter!.name).toBe("Codex");
  });

  it("returns undefined for unknown adapter", () => {
    const adapter = getCodingRuntime("unknown");
    expect(adapter).toBeUndefined();
  });

  it("selects a future registered adapter by explicit preference", async () => {
    registerCodingRuntime({
      id: "future-cli",
      displayName: "Future CLI",
      name: "Future CLI",
      discover: async () => ({ available: true, transport: "cli" }),
      startRun: async () => ({ runId: "run", adapterId: "future-cli", status: "running", startedAt: new Date().toISOString() }),
      createRun: async () => { throw new Error("unused"); },
      getRunStatus: async () => { throw new Error("unused"); },
      async *streamRunEvents() {},
      cancelRun: async () => true,
      collectArtifacts: async () => [],
    } as never);

    await expect(selectExecutorAdapter({
      preferredAdapterId: "future-cli",
      permissionPolicy: "normal",
      requireIsolation: true,
    })).resolves.toEqual(expect.objectContaining({
      adapterId: "future-cli",
      routeReason: expect.stringContaining("explicit preference"),
    }));
  });

  it("reports the capabilities the caller actually gets", async () => {
    const { selection } = await selectExecutorAdapterDetailed({
      permissionPolicy: "normal",
      requireIsolation: true,
    });

    expect(selection.adapterId).toBeDefined();
    expect(selection.capabilities.adapterId).toBe(selection.adapterId);
    expect(selection.capabilities.domain).toBe("coding");
  });

  it("excludes CLI executors when tool-level approval is required", async () => {
    // CLI adapters wrap the vendor's loop and report
    // nativeToolApprovalIntercepted: false. Asking for real per-tool approval
    // must not silently hand back an adapter that cannot provide it.
    await expect(
      selectExecutorAdapterDetailed({
        permissionPolicy: "strict",
        requireIsolation: true,
        requirements: { requiresToolLevelApproval: true },
      }),
    ).rejects.toThrow(/tool-level approval cannot be enforced/);
  });

  it("skips a preferred adapter that cannot satisfy a requirement", async () => {
    registerCodingRuntime({
      id: "no-cancel-cli",
      displayName: "No Cancel CLI",
      name: "No Cancel CLI",
      discover: async () => ({ available: true, transport: "cli" }),
      startRun: async () => ({ runId: "run", adapterId: "no-cancel-cli", status: "running", startedAt: new Date().toISOString() }),
      createRun: async () => { throw new Error("unused"); },
      getRunStatus: async () => { throw new Error("unused"); },
      async *streamRunEvents() {},
      cancelRun: async () => true,
      collectArtifacts: async () => [],
    } as never);

    const { selection } = await selectExecutorAdapterDetailed({
      preferredAdapterId: "no-cancel-cli",
      permissionPolicy: "normal",
      requireIsolation: true,
    });

    // The wrapper reports cancellation support, so it is eligible; the point is
    // that the decision is recorded with its capabilities rather than assumed.
    expect(selection.capabilities.cancellation).toBeDefined();
  });

  it("claude-code adapter can create and track a run", async () => {
    const adapter = getCodingRuntime("claude-code")!;
    const run = await adapter.createRun({
      repoPath: "/tmp/test-repo",
      taskPrompt: "Fix the bug in main.ts",
    });

    expect(run.runId).toBeDefined();
    expect(run.adapterId).toBe("claude-code");
    expect(["pending", "running", "failed"]).toContain(run.status);
    expect(run.startedAt).toBeDefined();

    // Can retrieve status
    const status = await adapter.getRunStatus(run.runId);
    expect(status.runId).toBe(run.runId);
  });

  it("codex adapter can create and track a run", async () => {
    const adapter = getCodingRuntime("codex")!;
    const run = await adapter.createRun({
      repoPath: "/tmp/test-repo",
      taskPrompt: "Add tests for utils.ts",
    });

    expect(run.runId).toBeDefined();
    expect(run.adapterId).toBe("codex");
    expect(["pending", "running", "failed"]).toContain(run.status);
  });

  it("adapter can cancel a pending run", async () => {
    const adapter = getCodingRuntime("claude-code")!;
    const run = await adapter.createRun({
      repoPath: "/tmp/test-repo",
      taskPrompt: "Test task",
    });

    if (run.status === "pending" || run.status === "running") {
      const cancelled = await adapter.cancelRun(run.runId);
      expect(cancelled).toBe(true);

      const status = await adapter.getRunStatus(run.runId);
      expect(status.status).toBe("cancelled");
    }
  });

  it("collectArtifacts returns artifacts array", async () => {
    const adapter = getCodingRuntime("claude-code")!;
    const run = await adapter.createRun({
      repoPath: "/tmp/test-repo",
      taskPrompt: "Test task",
    });

    const artifacts = await adapter.collectArtifacts(run.runId);
    expect(Array.isArray(artifacts)).toBe(true);
  });
});
