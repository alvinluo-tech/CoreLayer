import { describe, it, expect } from "vitest";
import { listCodingRuntimes, getCodingRuntime } from "../registry.js";

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
