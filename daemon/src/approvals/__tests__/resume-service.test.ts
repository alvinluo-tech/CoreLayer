import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeApprovedTool } from "../resume-service.js";

const mockTool = {
  id: "shell:exec",
  name: "shell.execute",
  execute: vi.fn(),
};

const mockRegistry = {
  resolveTool: vi.fn((id: string) => (id === "shell:exec" ? mockTool : undefined)),
  getTool: vi.fn(() => undefined),
};

vi.mock("../../tools/registry.js", () => ({
  getRegistry: () => mockRegistry,
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
