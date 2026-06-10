import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockEvaluate,
  mockGetRepositories,
} = vi.hoisted(() => ({
  mockEvaluate: vi.fn(),
  mockGetRepositories: vi.fn(),
}));

vi.mock("./permission-broker.js", () => ({
  PermissionBroker: vi.fn().mockImplementation(() => ({
    evaluate: (...args: unknown[]) => mockEvaluate(...args),
  })),
}));

vi.mock("../persistence/factory.js", () => ({
  getRepositories: (...args: unknown[]) => mockGetRepositories(...args),
}));

const { OSCapabilityBroker, getCapabilityBroker } = await import("./os-capability-broker.js");

describe("OSCapabilityBroker", () => {
  let broker: InstanceType<typeof OSCapabilityBroker>;
  const mockAuditLog = { create: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRepositories.mockReturnValue({ auditLog: mockAuditLog });
    broker = new OSCapabilityBroker();
  });

  describe("requestCapability", () => {
    it("returns allow decision and logs to audit", async () => {
      mockEvaluate.mockReturnValue({ decision: "allow", reason: "auto-allow" });

      const result = await broker.requestCapability({
        actorId: "agent-1",
        capability: "file.read",
        resource: "/tmp/test.txt",
        riskLevel: "low",
        proposedAction: "read",
      });

      expect(result.decision).toBe("allow");
      expect(mockAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "agent-1",
          action: "capability.file.read",
          resource: "/tmp/test.txt",
          permissionDecision: "allow",
        }),
      );
    });

    it("returns deny decision and logs to audit", async () => {
      mockEvaluate.mockReturnValue({ decision: "deny", reason: "not in allowlist" });

      const result = await broker.requestCapability({
        actorId: "agent-1",
        capability: "shell.exec",
        resource: "rm -rf /",
        riskLevel: "critical",
        proposedAction: "execute",
      });

      expect(result.decision).toBe("deny");
      expect(mockAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          result: "denied",
          confirmedByUser: false,
        }),
      );
    });

    it("handles audit log failure gracefully", async () => {
      mockEvaluate.mockReturnValue({ decision: "allow", reason: "ok" });
      mockAuditLog.create.mockRejectedValue(new Error("db unavailable"));

      const result = await broker.requestCapability({
        actorId: "agent-1",
        capability: "file.read",
        resource: "/tmp/test.txt",
        riskLevel: "low",
        proposedAction: "read",
      });

      expect(result.decision).toBe("allow");
    });
  });

  describe("requestFileRead", () => {
    it("sends correct capability request", async () => {
      mockEvaluate.mockReturnValue({ decision: "allow", reason: "low risk" });

      const result = await broker.requestFileRead("agent-1", "/tmp/file.txt");

      expect(result.decision).toBe("allow");
      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "agent-1",
          capability: "file.read",
          resource: "/tmp/file.txt",
          riskLevel: "low",
          proposedAction: "read",
        }),
      );
    });

    it("passes optional context", async () => {
      mockEvaluate.mockReturnValue({ decision: "allow", reason: "ok" });

      await broker.requestFileRead("agent-1", "/tmp/file.txt", {
        agentRunId: "run-1",
        taskId: "task-1",
        projectId: "proj-1",
      });

      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          agentRunId: "run-1",
          taskId: "task-1",
          projectId: "proj-1",
        }),
      );
    });
  });

  describe("requestFileWrite", () => {
    it("sends write action when no patch", async () => {
      mockEvaluate.mockReturnValue({ decision: "approval_required", reason: "show diff" });

      await broker.requestFileWrite("agent-1", "/tmp/file.txt");

      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: "file.write",
          riskLevel: "medium",
          proposedAction: "write",
        }),
      );
    });

    it("sends patch action when patch is provided", async () => {
      mockEvaluate.mockReturnValue({ decision: "approval_required", reason: "review patch" });

      await broker.requestFileWrite("agent-1", "/tmp/file.txt", "@@ -1,3 +1,4 @@\n+new line");

      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          proposedAction: "patch",
          proposedPatch: "@@ -1,3 +1,4 @@\n+new line",
        }),
      );
    });
  });

  describe("requestFileDelete", () => {
    it("sends delete request with high risk", async () => {
      mockEvaluate.mockReturnValue({ decision: "approval_required", reason: "dangerous" });

      await broker.requestFileDelete("agent-1", "/tmp/file.txt");

      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: "file.delete",
          riskLevel: "high",
          proposedAction: "delete",
        }),
      );
    });
  });

  describe("requestShellExec", () => {
    it("sends shell exec request with critical risk", async () => {
      mockEvaluate.mockReturnValue({ decision: "deny", reason: "not allowed" });

      await broker.requestShellExec("agent-1", "rm -rf /");

      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: "shell.exec",
          riskLevel: "critical",
          proposedAction: "execute",
          command: "rm -rf /",
        }),
      );
    });

    it("passes reason option", async () => {
      mockEvaluate.mockReturnValue({ decision: "allow", reason: "ok" });

      await broker.requestShellExec("agent-1", "ls -la", { reason: "list files" });

      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "ls -la",
        }),
      );
    });
  });

  describe("getPermissionBroker", () => {
    it("returns the permission broker instance", () => {
      const pb = broker.getPermissionBroker();
      expect(pb).toBeDefined();
    });
  });

  describe("getCapabilityBroker", () => {
    it("returns a singleton instance", () => {
      const b1 = getCapabilityBroker();
      const b2 = getCapabilityBroker();
      expect(b1).toBe(b2);
    });
  });
});
