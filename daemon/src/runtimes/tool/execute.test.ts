import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JarvisTool, ToolResult, JSONSchema } from "@jarvis/types";
import { isApprovalRequiredResult } from "@jarvis/runtime-protocol";
import { ToolRuntime } from "./execute.js";
import type { ToolExecutionResult } from "./execute.js";

// Mock dependencies
const mockExecute = vi.fn<() => Promise<ToolResult>>();

function makeTool(overrides: Partial<JarvisTool> = {}): JarvisTool {
  return {
    id: "test:tool",
    appId: "test",
    source: "native",
    name: "Test Tool",
    title: "Test Tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    risk: "low",
    permissions: [],
    requiresConfirmation: false,
    execute: mockExecute,
    ...overrides,
  };
}

const mockTool = makeTool();

function assertToolResult(result: unknown): ToolExecutionResult {
  expect(isApprovalRequiredResult(result)).toBe(false);
  return result as ToolExecutionResult;
}

const mockRegistry = {
  resolveTool: vi.fn((id: string) => (id === "test:tool" ? mockTool : undefined)),
  getTool: vi.fn(() => undefined),
};

vi.mock("../../tools/registry.js", () => ({
  getRegistry: () => mockRegistry,
}));

const mockApprovalRequests = {
  create: vi.fn(),
  approve: vi.fn(),
  findByToolCallId: vi.fn(),
};

const mockPermissionMemories = {
  find: vi.fn(),
};

vi.mock("../../db/factory.js", () => ({
  getRepositories: () => ({
    approvalRequests: mockApprovalRequests,
    permissionMemories: mockPermissionMemories,
  }),
}));

describe("ToolRuntime", () => {
  let runtime: ToolRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ success: true, data: "ok" });
    runtime = new ToolRuntime();
  });

  describe("validation gate", () => {
    it("should return failure when required field is missing", async () => {
      const raw = await runtime.execute(
        "test:tool",
        { limit: 10 }, // missing required 'query'
        { caller: "ai", runId: "run-1" },
      );
      const result = assertToolResult(raw);

      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain("Missing required field: query");
      expect(result.confirmed).toBe(false);
    });

    it("should return failure when args is not an object", async () => {
      const raw = await runtime.execute(
        "test:tool",
        "not an object",
        { caller: "ai", runId: "run-1" },
      );
      const result = assertToolResult(raw);

      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain("Expected an object argument");
    });

    it("should return failure when field has wrong type", async () => {
      const raw = await runtime.execute(
        "test:tool",
        { query: 123 }, // query should be string
        { caller: "ai", runId: "run-1" },
      );
      const result = assertToolResult(raw);

      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain("Field 'query' should be a string");
    });

    it("should not call tool execute when validation fails", async () => {
      await runtime.execute(
        "test:tool",
        { limit: "not a number" }, // missing required 'query', limit wrong type
        { caller: "ai", runId: "run-1" },
      );

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("should not create approval request when validation fails", async () => {
      const highRiskTool = makeTool({
        risk: "high",
        requiresConfirmation: true,
      });
      mockRegistry.resolveTool.mockReturnValueOnce(highRiskTool);

      await runtime.execute(
        "test:tool",
        {}, // missing required 'query'
        { caller: "ai", runId: "run-1" },
      );

      expect(mockApprovalRequests.create).not.toHaveBeenCalled();
    });
  });

  describe("valid args", () => {
    it("should execute tool with valid args", async () => {
      const raw = await runtime.execute(
        "test:tool",
        { query: "hello" },
        { caller: "ai" },
      );
      const result = assertToolResult(raw);

      expect(result.result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith({ query: "hello" });
    });

    it("should allow null schema (no validation needed)", async () => {
      const noSchemaTool = makeTool({ inputSchema: {} as JSONSchema });
      mockRegistry.resolveTool.mockReturnValueOnce(noSchemaTool);

      const raw = await runtime.execute(
        "test:tool",
        { anything: "goes" },
        { caller: "ai" },
      );
      const result = assertToolResult(raw);

      expect(result.result.success).toBe(true);
    });
  });

  describe("non-blocking approval", () => {
    it("should return ApprovalRequiredResult for high-risk AI calls", async () => {
      const highRiskTool = makeTool({
        risk: "high",
        requiresConfirmation: true,
      });
      mockRegistry.resolveTool.mockReturnValueOnce(highRiskTool);
      mockApprovalRequests.create.mockResolvedValue({ id: "approval-1" });

      const raw = await runtime.execute(
        "test:tool",
        { query: "dangerous" },
        { caller: "ai", runId: "run-1" },
      );

      expect(isApprovalRequiredResult(raw)).toBe(true);
      if (isApprovalRequiredResult(raw)) {
        expect(raw.kind).toBe("approval_required");
        expect(raw.approvalRequestId).toBe("approval-1");
        expect(raw.operationKind).toBe("tool.execute");
        expect(raw.operationPayload).toEqual({ args: { query: "dangerous" } });
      }
      // Must NOT have called tool.execute
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("should not create approval when runId is missing", async () => {
      const highRiskTool = makeTool({
        risk: "high",
        requiresConfirmation: true,
      });
      mockRegistry.resolveTool.mockReturnValueOnce(highRiskTool);

      const raw = await runtime.execute(
        "test:tool",
        { query: "dangerous" },
        { caller: "ai" }, // no runId
      );

      // Without runId, falls through to executeWithGuard (non-AI path)
      expect(isApprovalRequiredResult(raw)).toBe(false);
    });
  });

  describe("tool not found", () => {
    it("should return failure for unknown tool", async () => {
      const raw = await runtime.execute(
        "unknown:tool",
        {},
        { caller: "ai" },
      );
      const result = assertToolResult(raw);

      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain("Tool not found");
    });
  });
});
