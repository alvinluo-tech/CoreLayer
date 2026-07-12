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
const pendingStore = new Map<string, any>();
const mockPendingActions = {
  create: vi.fn(async (input: any) => {
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      ...input,
      executorRunId: input.executorRunId ?? null,
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      status: "blocked",
      error: null,
      result: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    pendingStore.set(row.id, row);
    return row;
  }),
  transition: vi.fn(async (id: string, from: string[], to: string, error?: string, result?: unknown) => {
    const row = pendingStore.get(id);
    if (!row || !from.includes(row.status)) return null;
    const updated = { ...row, status: to, error: error ?? null, result: result ?? row.result };
    pendingStore.set(id, updated);
    return updated;
  }),
  getByFingerprint: vi.fn(async (fingerprint: string) =>
    [...pendingStore.values()].reverse().find((row) => row.actionFingerprint === fingerprint) ?? null),
  getByApprovalRequest: vi.fn(async (approvalRequestId: string) =>
    [...pendingStore.values()].reverse().find((row) => row.approvalRequestId === approvalRequestId) ?? null),
  getOpenByWorkspace: vi.fn(async (workspaceId: string) =>
    [...pendingStore.values()].filter((row) => row.workspaceId === workspaceId && !["completed", "failed", "cancelled", "expired"].includes(row.status))),
  deleteAll: vi.fn(async () => pendingStore.clear()),
};

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    approvalRequests: mockApprovalRequests,
    pendingActions: mockPendingActions,
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

  it("executes a durable approved action only once", async () => {
    mockApprovalRequests.getById.mockResolvedValue({
      id: "req-idempotent",
      status: "approved",
      toolId: "shell:exec",
      toolName: "shell.execute",
      runId: "run-1",
      operationKind: "tool.execute",
      operationPayload: { args: { command: "ls" } },
    });
    const pending = await createPendingAction({
      approvalRequestId: "req-idempotent",
      runId: "run-1",
      action: sampleAction,
      strategy: "manual_block",
    });
    await approvePendingAction(pending.id);

    const first = await executeApprovedTool("req-idempotent");
    const second = await executeApprovedTool("req-idempotent");

    expect(second).toEqual(first);
    expect(mockTool.execute).toHaveBeenCalledTimes(1);
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
  beforeEach(async () => {
    await resetPendingActions();
  });

  it("should create a pending action", async () => {
    const action = await createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    expect(action.id).toBeDefined();
    expect(action.status).toBe("blocked");
    expect(action.actionFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should approve a blocked action", async () => {
    const action = await createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const approved = await approvePendingAction(action.id);
    expect(approved).not.toBeNull();
    expect(approved!.status).toBe("approved");
  });

  it("should not approve a non-blocked action", async () => {
    const action = await createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    await approvePendingAction(action.id);
    const result = await approvePendingAction(action.id);
    expect(result).toBeNull();
  });

  it("should complete an action successfully", async () => {
    const action = await createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const completed = await completePendingAction(action.id, true);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("completed");
  });

  it("should complete an action with failure", async () => {
    const action = await createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const failed = await completePendingAction(action.id, false, "Permission denied");
    expect(failed).not.toBeNull();
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBe("Permission denied");
  });

  it("should cancel an action", async () => {
    const action = await createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    const cancelled = await cancelPendingAction(action.id);
    expect(cancelled).not.toBeNull();
    expect(cancelled!.status).toBe("cancelled");
  });

  it("should detect duplicate approval", async () => {
    const first = await createPendingAction({
      approvalRequestId: "approval-1",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    await expect(isDuplicateApproval(first.actionFingerprint)).resolves.toBe(false);

    const action2 = await createPendingAction({
      approvalRequestId: "approval-2",
      runId: "run-1",
      action: sampleAction,
      strategy: "prompted_reentry",
    });

    await completePendingAction(action2.id, true);
    await expect(isDuplicateApproval(action2.actionFingerprint)).resolves.toBe(true);
  });
});
