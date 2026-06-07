import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getRepositories before importing the route
const mockExpireStale = vi.fn();
const mockGetPending = vi.fn();
const mockGetById = vi.fn();
const mockApprove = vi.fn();
const mockDeny = vi.fn();
const mockCreate = vi.fn();

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
  }),
  apiError: (c: unknown, msg: string, status = 500) => (c as { json: (body: unknown, s?: number) => unknown }).json({ error: msg }, status),
  extractErrorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
  logError: vi.fn(),
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
});
