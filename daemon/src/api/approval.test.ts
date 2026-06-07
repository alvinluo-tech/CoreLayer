import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getRepositories before importing the route
const mockExpireStale = vi.fn();
const mockGetPending = vi.fn();
const mockGetById = vi.fn();
const mockApprove = vi.fn();
const mockDeny = vi.fn();
const mockCreate = vi.fn();
const mockAgentRunsGetById = vi.fn();
const mockAgentRunsUpdateStatus = vi.fn();
const mockConversationsAddMessage = vi.fn();
const mockConversationsGetById = vi.fn();

const mockResolvePendingConfirmation = vi.fn().mockReturnValue(true);
vi.mock("../runtimes/index.js", () => ({
  toolRuntime: {
    getPermissionGuard: () => ({
      resolvePendingConfirmation: mockResolvePendingConfirmation,
    }),
  },
  getRepositories: () => ({
    approvalRequests: {
      expireStale: mockExpireStale,
      getPending: mockGetPending,
      getById: mockGetById,
      approve: mockApprove,
      deny: mockDeny,
      create: mockCreate,
    },
    toolCallLogs: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    permissionMemories: { create: vi.fn() },
    agentRuns: {
      getById: mockAgentRunsGetById,
      updateStatus: mockAgentRunsUpdateStatus,
    },
    conversations: {
      addMessage: mockConversationsAddMessage,
      getById: mockConversationsGetById,
    },
  }),
  apiError: (c: unknown, msg: string, status = 500) => (c as { json: (body: unknown, s?: number) => unknown }).json({ error: msg }, status),
  extractErrorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
  logError: vi.fn(),
}));

vi.mock("../runtime/resume.js", () => ({
  executeApprovedTool: vi.fn().mockResolvedValue({
    approvalRequestId: "id-1",
    toolResult: { success: true, data: "output" },
    toolId: "shell:exec",
    toolName: "shell.execute",
    runId: "run-1",
  }),
}));

vi.mock("../orchestrator/conversation.js", () => ({
  handleMessageInConversation: vi.fn().mockResolvedValue({
    userMessage: { id: "msg-1" },
    assistantMessage: { id: "msg-2", content: "Done" },
    conversation: { id: "conv-1" },
  }),
}));

// Import after mocks
const { default: approvalRoutes } = await import("./approval.js");

import { Hono } from "hono";

function createApp() {
  const app = new Hono();
  app.route("/api/approvals", approvalRoutes);
  return app;
}

describe("Approval API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("POST /expire-stale", () => {
    it("should return expired count and resolve in-memory confirmations", async () => {
      mockExpireStale.mockResolvedValue({ count: 2, ids: ["id-1", "id-2"] });

      const res = await app.request("/api/approvals/expire-stale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.expired).toBe(2);
      expect(mockResolvePendingConfirmation).toHaveBeenCalledTimes(2);
      expect(mockResolvePendingConfirmation).toHaveBeenCalledWith("id-1", false);
      expect(mockResolvePendingConfirmation).toHaveBeenCalledWith("id-2", false);
    });

    it("should return 0 expired when nothing is stale", async () => {
      mockExpireStale.mockResolvedValue({ count: 0, ids: [] });

      const res = await app.request("/api/approvals/expire-stale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.expired).toBe(0);
      expect(mockResolvePendingConfirmation).not.toHaveBeenCalled();
    });

    it("should pass custom maxAgeMs to expireStale", async () => {
      mockExpireStale.mockResolvedValue({ count: 0, ids: [] });

      await app.request("/api/approvals/expire-stale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxAgeMs: 60_000 }),
      });

      expect(mockExpireStale).toHaveBeenCalledWith(60_000);
    });
  });

  describe("POST /:id/approve", () => {
    it("should return 202 and approve the request", async () => {
      mockGetById.mockResolvedValue({
        id: "id-1",
        status: "pending",
        toolId: "shell:exec",
        toolName: "shell.execute",
        risk: "high",
        runId: "run-1",
        source: "rest",
        args: { command: "ls" },
        toolCallId: "tc-1",
      });
      mockApprove.mockResolvedValue({ id: "id-1", status: "approved" });
      mockAgentRunsGetById.mockResolvedValue({
        id: "run-1",
        conversationId: "conv-1",
        projectId: null,
        mode: "chat",
      });

      const res = await app.request("/api/approvals/id-1/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.data.status).toBe("approved");
      expect(mockResolvePendingConfirmation).toHaveBeenCalledWith("id-1", true);
    });

    it("should return 404 for non-existent request", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.request("/api/approvals/missing/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
    });

    it("should return 400 for non-pending request", async () => {
      mockGetById.mockResolvedValue({
        id: "id-1",
        status: "approved",
        toolId: "shell:exec",
        toolName: "shell.execute",
      });

      const res = await app.request("/api/approvals/id-1/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /:id/deny", () => {
    it("should deny the request and update agent run", async () => {
      mockGetById.mockResolvedValue({
        id: "id-1",
        status: "pending",
        toolId: "shell:exec",
        toolName: "shell.execute",
        risk: "high",
        runId: "run-1",
        source: "rest",
        args: { command: "ls" },
      });
      mockDeny.mockResolvedValue({ id: "id-1", status: "denied" });

      const res = await app.request("/api/approvals/id-1/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("denied");
      expect(mockResolvePendingConfirmation).toHaveBeenCalledWith("id-1", false);
      expect(mockAgentRunsUpdateStatus).toHaveBeenCalledWith("run-1", "failed", "User denied tool approval");
    });

    it("should return 404 for non-existent request", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.request("/api/approvals/missing/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
    });
  });
});
