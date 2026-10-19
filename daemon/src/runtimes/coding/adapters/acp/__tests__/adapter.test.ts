import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AcpCodingAdapter, resolveClaudeModel } from "../adapter.js";
import { locateAcpxRuntime, resetAcpxRuntimeCache } from "../acpx-runtime.js";
import { CodingExecutorAdapterWrapper } from "../../../executor-adapter-wrapper.js";
import type { CodingTask } from "../../../types.js";

// Spawning acpx is covered by the end-to-end run; these tests exercise the
// guard rails that must hold before any process exists.
vi.mock("../../../../capabilities/os-capability-broker.js", () => ({
  getCapabilityBroker: () => ({
    requestShellExec: vi.fn().mockResolvedValue({ decision: "allow", reason: "test" }),
  }),
}));
vi.mock("../../../../persistence/audit-log.js", () => ({ logAuditEntry: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../../services/workspace-event-emitter.js", () => ({ emitWorkspaceEvent: vi.fn() }));
vi.mock("../../../artifact-persistence.js", () => ({ persistArtifacts: vi.fn() }));

function makeTask(overrides: Partial<CodingTask> = {}): CodingTask {
  return {
    repoPath: process.cwd(),
    taskPrompt: "do the thing",
    ...overrides,
  };
}

describe("AcpCodingAdapter", () => {
  const originalModel = process.env.ANTHROPIC_MODEL;

  beforeEach(() => {
    resetAcpxRuntimeCache();
  });

  afterEach(() => {
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = originalModel;
  });

  it("reports a capability profile the CLI wrappers cannot offer", () => {
    const capabilities = new AcpCodingAdapter().getCapabilities();

    expect(capabilities.adapterId).toBe("acp");
    expect(capabilities.permissionProjection).toBe("native");
    expect(capabilities.metadata?.nativeToolApprovalIntercepted).toBe(true);
    expect(capabilities.metadata?.approvalGranularity).toBe("per-tool");
    expect(capabilities.resumableSession).toBe(true);
  });

  it("surfaces its own capabilities through the executor wrapper", () => {
    const wrapper = new CodingExecutorAdapterWrapper(new AcpCodingAdapter());
    const capabilities = wrapper.getCapabilities();

    // Regression: the wrapper used to hardcode CLI capabilities for every
    // adapter, which would have hidden that ACP can intercept tool approvals.
    expect(capabilities.permissionProjection).toBe("native");
    expect(capabilities.metadata?.nativeToolApprovalIntercepted).toBe(true);
  });

  it("still reports CLI capabilities for adapters that declare none", async () => {
    const { ClaudeCodeCliAdapter } = await import("../../claude-code/cli-adapter.js");
    const wrapper = new CodingExecutorAdapterWrapper(new ClaudeCodeCliAdapter());
    expect(wrapper.getCapabilities().permissionProjection).toBe("stdout-pattern");
    expect(wrapper.getCapabilities().metadata?.nativeToolApprovalIntercepted).toBe(false);
  });

  it("refuses to start when the model is not a DeepSeek model", async () => {
    const adapter = new AcpCodingAdapter();
    const handle = await adapter.startRun(makeTask({ dbRunId: "run-guard-1", executorModel: "claude-sonnet-5" }));

    expect(handle.status).toBe("failed");
    const info = await adapter.getRunStatus("run-guard-1");
    expect(info.error).toContain("DeepSeek");
    expect(info.artifacts[0]).toMatchObject({ type: "error" });
  });

  it("refuses to start when no model is configured at all", async () => {
    delete process.env.ANTHROPIC_MODEL;
    const adapter = new AcpCodingAdapter();
    const handle = await adapter.startRun(makeTask({ dbRunId: "run-guard-2" }));

    expect(handle.status).toBe("failed");
    const info = await adapter.getRunStatus("run-guard-2");
    expect(info.error).toContain("explicit DeepSeek model");
  });

  it("rejects a run without a repository path", async () => {
    const adapter = new AcpCodingAdapter();
    const handle = await adapter.startRun(makeTask({ dbRunId: "run-no-repo", repoPath: "", executorModel: "deepseek-v4-pro" }));

    expect(handle.status).toBe("failed");
    expect((await adapter.getRunStatus("run-no-repo")).error).toContain("repoPath is required");
  });
});

describe("resolveClaudeModel", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_MODEL;
  });

  it("prefers the model pinned by the executor policy", () => {
    process.env.ANTHROPIC_MODEL = "deepseek-v4-flash";
    expect(resolveClaudeModel(makeTask({ executorModel: "deepseek-v4-pro" }))).toBe("deepseek-v4-pro");
  });

  it("falls back to the ambient ANTHROPIC_MODEL", () => {
    process.env.ANTHROPIC_MODEL = "deepseek-v4-flash";
    expect(resolveClaudeModel(makeTask())).toBe("deepseek-v4-flash");
  });

  it("returns undefined when neither is set", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(resolveClaudeModel(makeTask())).toBeUndefined();
  });
});

describe("locateAcpxRuntime", () => {
  it("finds acpx through the workspace dependency", () => {
    resetAcpxRuntimeCache();
    const runtime = locateAcpxRuntime();

    expect(runtime).not.toBeNull();
    expect(runtime?.prefixArgs.join(" ")).toContain("cli.js");
  });
});
