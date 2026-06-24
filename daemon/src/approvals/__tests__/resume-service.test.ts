import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeApprovedTool,
  createPendingAction,
  approvePendingAction,
  completePendingAction,
  cancelPendingAction,
  isDuplicateApproval,
  resetPendingActions,
} from "../resume-service.js";
import type { RuntimeAction } from "@jarvis/runtime-protocol";

const mockTool = {
  id: "shell:exec",
  name: "shell.execute",
  execute: vi.fn(),
};

const mockRegistry = {
  resolveTool: vi.fn((id: string) => (id === "shell:exec" ? mockTool : undefined)),
  getTool: vi.fn(() => undefined),
};

vi.mock("../../runtimes/tool/adapters/native-tools/registry.js", () => ({
  getRegistry: () => mockRegistry,
  registerJarvisTool: vi.fn(),
  registerTool: vi.fn(),
  getTool: vi.fn(() => null),
  getAllJarvisTools: vi.fn(() => []),
  getAllTools: vi.fn(() => []),
}));

const mockApprovalRequests = {
  getById: vi.fn(),
};

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    approvalRequests: mockApprovalRequests,
  }),
}));

describe("executeApprovedTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTool.execute.mockResolvedValue({ success: true, data: "output" });
  });

  it("should execute tool with stored payload", async () => {
    mockApprovalRequests.getById.mockResolvedValue({
      id: "req-1",
      status: "approved",
      toolId: "shell:exec",
      toolName: "shell.execute",
      runId: "run-1",
      operationKind: "tool.execute",
      operationPayload: { args: { command: "ls" } },
    });

    const result = await executeApprovedTool("req-1");

    expect(result.toolResult).toEqual({ success: true, data: "output" });
    expect(result.runId).toBe("run-1");
    expect(mockTool.execute).toHaveBeenCalledWith({ command: "ls" });
  });

  it("should throw for non-existent approval request", async () => {
    mockApprovalRequests.getById.mockResolvedValue(null);

    await expect(executeApprovedTool("missing")).rejects.toThrow(
      "Approval request not found: missing",
    );
  });

  it("should throw for non-approved request", async () => {
    mockApprovalRequests.getById.mockResolvedValue({
      id: "req-1",
      status: "pending",
      operationKind: "tool.execute",
      operationPayload: { args: {} },
    });

    await expect(executeApprovedTool("req-1")).rejects.toThrow(
      "Approval request is not approved: pending",
    );
  });

  it("should throw for missing resume payload", async () => {
    mockApprovalRequests.getById.mockResolvedValue({
      id: "req-1",
      status: "approved",
      operationKind: null,
      operationPayload: null,
    });

    await expect(executeApprovedTool("req-1")).rejects.toThrow(
      "Approval request missing resume payload",
    );
  });

  it("should return error result for missing tool", async () => {
    mockApprovalRequests.getById.mockResolvedValue({
      id: "req-1",
      status: "approved",
      toolId: "unknown:tool",
      toolName: "unknown",
      runId: "run-1",
      operationKind: "tool.execute",
      operationPayload: { args: {} },
    });

    const result = await executeApprovedTool("req-1");

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.error).toContain("Tool not found");
  });
});

const sampleAction: RuntimeAction = {
  id: "action-1",
  type: "file.write",
  target: "src/index.ts",
  runId: "run-1",
  agentId: "agent-1",
  workspaceId: "ws-1",
};

describe("Pending Actions", () => {
  beforeEach(() => {
    resetPendingActions();
  });

  it("should create a pending action", () => {
    const action = createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    expect(action.id).toBeDefined();
    expect(action.status).toBe("blocked");
    expect(action.actionFingerprint).toContain("file.write");
  });

  it("should approve a blocked action", () => {
    const action = createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const approved = approvePendingAction(action.id);
    expect(approved).not.toBeNull();
    expect(approved!.status).toBe("approved");
  });

  it("should not approve a non-blocked action", () => {
    const action = createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    approvePendingAction(action.id);
    const result = approvePendingAction(action.id);
    expect(result).toBeNull();
  });

  it("should complete an action successfully", () => {
    const action = createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const completed = completePendingAction(action.id, true);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("completed");
  });

  it("should complete an action with failure", () => {
    const action = createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const failed = completePendingAction(action.id, false, "Permission denied");
    expect(failed).not.toBeNull();
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBe("Permission denied");
  });

  it("should cancel an action", () => {
    const action = createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const cancelled = cancelPendingAction(action.id);
    expect(cancelled).not.toBeNull();
    expect(cancelled!.status).toBe("cancelled");
  });

  it("should detect duplicate approval", () => {
    createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    expect(isDuplicateApproval("file.write:src/index.ts:run-1")).toBe(false);

    const action2 = createPendingAction({
      approvalRequestId: "approval-2",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    completePendingAction(action2.id, true);
    expect(isDuplicateApproval("file.write:src/index.ts:run-1")).toBe(true);
  });
});
