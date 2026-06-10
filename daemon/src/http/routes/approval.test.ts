import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetPending: vi.fn(),
  mockGetById: vi.fn(),
  mockApprove: vi.fn(),
  mockDeny: vi.fn(),
  mockMarkExecuting: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockExpireStale: vi.fn(),
  mockGetByRunId: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockToolCallLogsCreate: vi.fn(),
  mockAgentRunsGetById: vi.fn(),
  mockAgentRunsUpdateStatus: vi.fn(),
  mockConversationsAddMessage: vi.fn(),
  mockPermissionMemoriesCreate: vi.fn(),
  mockResolvePendingConfirmation: vi.fn(),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    approvalRequests: {
      getPending: (...args: unknown[]) => mocks.mockGetPending(...args),
      getById: (...args: unknown[]) => mocks.mockGetById(...args),
      approve: (...args: unknown[]) => mocks.mockApprove(...args),
      deny: (...args: unknown[]) => mocks.mockDeny(...args),
      markExecuting: (...args: unknown[]) => mocks.mockMarkExecuting(...args),
      markFailed: (...args: unknown[]) => mocks.mockMarkFailed(...args),
      expireStale: (...args: unknown[]) => mocks.mockExpireStale(...args),
      getByRunId: (...args: unknown[]) => mocks.mockGetByRunId(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mocks.mockAuditLogCreate(...args),
    },
    toolCallLogs: {
      create: (...args: unknown[]) => mocks.mockToolCallLogsCreate(...args),
    },
    agentRuns: {
      getById: (...args: unknown[]) => mocks.mockAgentRunsGetById(...args),
      updateStatus: (...args: unknown[]) => mocks.mockAgentRunsUpdateStatus(...args),
    },
    conversations: {
      addMessage: (...args: unknown[]) => mocks.mockConversationsAddMessage(...args),
    },
    permissionMemories: {
      create: (...args: unknown[]) => mocks.mockPermissionMemoriesCreate(...args),
    },
  }),
}));

vi.mock("../../runtimes/tool/public-api.js", () => ({
  toolRuntime: {
    getPermissionGuard: () => ({
      resolvePendingConfirmation: (...args: unknown[]) => mocks.mockResolvePendingConfirmation(...args),
    }),
  },
}));

vi.mock("../../approvals/resume-service.js", () => ({
  executeApprovedTool: vi.fn().mockResolvedValue({
    approvalRequestId: "a1",
    toolResult: { success: true, data: "ok" },
    toolId: "t1",
    toolName: "test-tool",
    runId: "r1",
  }),
}));

vi.mock("../../runtimes/agent/application/conversation.js", () => ({
  handleMessageInConversation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status: number) => {
    return new Response(JSON.stringify({ error: message }), { status });
  }),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import approvalRoutes from "./approval.js";

const app = approvalRoutes;

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

const pendingApproval = {
  id: "a1",
  status: "pending",
  toolId: "t1",
  toolName: "test-tool",
  risk: "medium",
  source: "mcp",
  args: { path: "/tmp" },
  runId: "r1",
  toolCallId: "tc1",
};

describe("approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetPending.mockResolvedValue([]);
    mocks.mockGetById.mockResolvedValue({ ...pendingApproval });
    mocks.mockApprove.mockResolvedValue({ ...pendingApproval, status: "approved" });
    mocks.mockDeny.mockResolvedValue({ ...pendingApproval, status: "denied" });
    mocks.mockExpireStale.mockResolvedValue({ count: 0, ids: [] });
    mocks.mockGetByRunId.mockResolvedValue([]);
    mocks.mockAgentRunsGetById.mockResolvedValue({ id: "r1", conversationId: "c1", mode: "chat" });
  });

  // ── GET / ──
  describe("GET /", () => {
    it("returns pending approvals", async () => {
      mocks.mockGetPending.mockResolvedValue([pendingApproval]);
      const res = await app.fetch(makeRequest(""));
      const json = (await res.json()) as { data: unknown[] };
      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetPending.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest(""));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /batch/approve ──
  describe("POST /batch/approve", () => {
    it("approves multiple requests", async () => {
      const res = await app.fetch(makeRequest("/batch/approve", "POST", { ids: ["a1"] }));
      expect(res.status).toBe(202);
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("a1", true);
      expect(mocks.mockApprove).toHaveBeenCalledWith("a1");
    });

    it("returns empty data for empty ids", async () => {
      const res = await app.fetch(makeRequest("/batch/approve", "POST", { ids: [] }));
      const json = (await res.json()) as { data: unknown[] };
      expect(json.data).toHaveLength(0);
    });

    it("skips non-pending items", async () => {
      mocks.mockGetById.mockResolvedValue({ ...pendingApproval, status: "approved" });
      const res = await app.fetch(makeRequest("/batch/approve", "POST", { ids: ["a1"] }));
      expect(res.status).toBe(202);
      expect(mocks.mockApprove).not.toHaveBeenCalled();
    });

    it("skips nonexistent items", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/batch/approve", "POST", { ids: ["nope"] }));
      expect(res.status).toBe(202);
      expect(mocks.mockApprove).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/batch/approve", "POST", { ids: ["a1"] }));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /batch/deny ──
  describe("POST /batch/deny", () => {
    it("denies multiple requests", async () => {
      const res = await app.fetch(makeRequest("/batch/deny", "POST", { ids: ["a1"] }));
      expect(res.status).toBe(200);
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("a1", false);
      expect(mocks.mockDeny).toHaveBeenCalledWith("a1");
      expect(mocks.mockToolCallLogsCreate).toHaveBeenCalled();
    });

    it("updates run status for denied items with runId", async () => {
      const res = await app.fetch(makeRequest("/batch/deny", "POST", { ids: ["a1"] }));
      expect(res.status).toBe(200);
      expect(mocks.mockAgentRunsUpdateStatus).toHaveBeenCalledWith("r1", "failed", "User denied tool approval");
    });

    it("skips non-pending items", async () => {
      mocks.mockGetById.mockResolvedValue({ ...pendingApproval, status: "approved" });
      await app.fetch(makeRequest("/batch/deny", "POST", { ids: ["a1"] }));
      expect(mocks.mockDeny).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/batch/deny", "POST", { ids: ["a1"] }));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /expire-stale ──
  describe("POST /expire-stale", () => {
    it("expires stale approvals", async () => {
      mocks.mockExpireStale.mockResolvedValue({ count: 3, ids: ["e1", "e2", "e3"] });
      const res = await app.fetch(makeRequest("/expire-stale", "POST", {}));
      const json = (await res.json()) as { expired: number };
      expect(res.status).toBe(200);
      expect(json.expired).toBe(3);
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledTimes(3);
    });

    it("resolves with false for each expired id", async () => {
      mocks.mockExpireStale.mockResolvedValue({ count: 2, ids: ["e1", "e2"] });
      await app.fetch(makeRequest("/expire-stale", "POST", {}));
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("e1", false);
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("e2", false);
    });

    it("returns 500 on error", async () => {
      mocks.mockExpireStale.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/expire-stale", "POST", {}));
      expect(res.status).toBe(500);
    });
  });

  // ── GET /:id ──
  describe("GET /:id", () => {
    it("returns approval request", async () => {
      const res = await app.fetch(makeRequest("/a1"));
      const json = (await res.json()) as { data: { id: string } };
      expect(res.status).toBe(200);
      expect(json.data.id).toBe("a1");
    });

    it("returns 404 if not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/a1"));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /:id/approve ──
  describe("POST /:id/approve", () => {
    it("approves a pending request", async () => {
      const res = await app.fetch(makeRequest("/a1/approve", "POST"));
      expect(res.status).toBe(202);
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("a1", true);
      expect(mocks.mockApprove).toHaveBeenCalledWith("a1");
      expect(mocks.mockAuditLogCreate).toHaveBeenCalled();
    });

    it("returns 404 if not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/nope/approve", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns 400 if already approved", async () => {
      mocks.mockGetById.mockResolvedValue({ ...pendingApproval, status: "approved" });
      const res = await app.fetch(makeRequest("/a1/approve", "POST"));
      expect(res.status).toBe(400);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/a1/approve", "POST"));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /:id/deny ──
  describe("POST /:id/deny", () => {
    it("denies a pending request", async () => {
      const res = await app.fetch(makeRequest("/a1/deny", "POST"));
      expect(res.status).toBe(200);
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("a1", false);
      expect(mocks.mockDeny).toHaveBeenCalledWith("a1");
      expect(mocks.mockToolCallLogsCreate).toHaveBeenCalled();
      expect(mocks.mockAuditLogCreate).toHaveBeenCalled();
    });

    it("updates run status when request has runId", async () => {
      const res = await app.fetch(makeRequest("/a1/deny", "POST"));
      expect(res.status).toBe(200);
      expect(mocks.mockAgentRunsUpdateStatus).toHaveBeenCalledWith("r1", "failed", "User denied tool approval");
    });

    it("skips run update when no runId", async () => {
      mocks.mockGetById.mockResolvedValue({ ...pendingApproval, runId: null });
      const res = await app.fetch(makeRequest("/a1/deny", "POST"));
      expect(res.status).toBe(200);
      expect(mocks.mockAgentRunsUpdateStatus).not.toHaveBeenCalled();
    });

    it("returns 404 if not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/nope/deny", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns 400 if already denied", async () => {
      mocks.mockGetById.mockResolvedValue({ ...pendingApproval, status: "denied" });
      const res = await app.fetch(makeRequest("/a1/deny", "POST"));
      expect(res.status).toBe(400);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/a1/deny", "POST"));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /:id/remember ──
  describe("POST /:id/remember", () => {
    it("remembers auto decision for pending request (approves)", async () => {
      const res = await app.fetch(makeRequest("/a1/remember", "POST", { decision: "auto" }));
      expect(res.status).toBe(200);
      expect(mocks.mockPermissionMemoriesCreate).toHaveBeenCalled();
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("a1", true);
      expect(mocks.mockApprove).toHaveBeenCalled();
    });

    it("remembers deny decision for pending request", async () => {
      const res = await app.fetch(makeRequest("/a1/remember", "POST", { decision: "deny" }));
      expect(res.status).toBe(200);
      expect(mocks.mockResolvePendingConfirmation).toHaveBeenCalledWith("a1", false);
      expect(mocks.mockDeny).toHaveBeenCalled();
      expect(mocks.mockAgentRunsUpdateStatus).toHaveBeenCalled();
    });

    it("remembers confirm decision (no auto-approve)", async () => {
      const res = await app.fetch(makeRequest("/a1/remember", "POST", { decision: "confirm" }));
      expect(res.status).toBe(200);
      expect(mocks.mockPermissionMemoriesCreate).toHaveBeenCalled();
    });

    it("returns 400 for invalid decision", async () => {
      const res = await app.fetch(makeRequest("/a1/remember", "POST", { decision: "invalid" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 if approval not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/nope/remember", "POST", { decision: "auto" }));
      expect(res.status).toBe(404);
    });

    it("skips status change if request is not pending", async () => {
      mocks.mockGetById.mockResolvedValue({ ...pendingApproval, status: "approved" });
      const res = await app.fetch(makeRequest("/a1/remember", "POST", { decision: "auto" }));
      expect(res.status).toBe(200);
      expect(mocks.mockPermissionMemoriesCreate).toHaveBeenCalled();
      expect(mocks.mockApprove).not.toHaveBeenCalled();
      expect(mocks.mockDeny).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/a1/remember", "POST", { decision: "auto" }));
      expect(res.status).toBe(500);
    });
  });
});
