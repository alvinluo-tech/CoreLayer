import { describe, it, expect } from "vitest";
import { PermissionBroker } from "./permission-broker.js";

describe("PermissionBroker", () => {
  const broker = new PermissionBroker();

  it("allows file.read automatically", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "file.read",
      resource: "/tmp/test.txt",
      riskLevel: "low",
      proposedAction: "read",
    });
    expect(result.decision).toBe("allow");
  });

  it("requires approval for file.write", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "file.write",
      resource: "/tmp/test.txt",
      riskLevel: "medium",
      proposedAction: "write",
    });
    expect(result.decision).toBe("approval_required");
  });

  it("requires approval for file.patch with diff", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "file.write",
      resource: "/tmp/test.txt",
      riskLevel: "medium",
      proposedAction: "patch",
      proposedPatch: "--- a/test.txt\n+++ b/test.txt\n@@ -1 +1 @@\n-old\n+new",
    });
    expect(result.decision).toBe("approval_required");
  });

  it("requires approval for file.delete", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "file.delete",
      resource: "/tmp/test.txt",
      riskLevel: "high",
      proposedAction: "delete",
    });
    expect(result.decision).toBe("approval_required");
  });

  it("allows shell.exec for allowlisted commands with low risk", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "shell.exec",
      resource: "git status",
      riskLevel: "low",
      proposedAction: "execute",
      command: "git status",
    });
    expect(result.decision).toBe("allow");
    expect(result.allowlistMatch).toBe("git status");
  });

  it("requires approval for allowlisted commands with medium risk", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "shell.exec",
      resource: "pnpm install",
      riskLevel: "medium",
      proposedAction: "execute",
      command: "pnpm install",
    });
    expect(result.decision).toBe("approval_required");
    expect(result.allowlistMatch).toBe("pnpm ");
  });

  it("denies shell.exec for non-allowlisted commands", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "shell.exec",
      resource: "rm -rf /",
      riskLevel: "critical",
      proposedAction: "execute",
      command: "rm -rf /",
    });
    expect(result.decision).toBe("deny");
  });

  it("requires approval for screenshot", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "screenshot",
      resource: "screen-0",
      riskLevel: "high",
      proposedAction: "capture",
    });
    expect(result.decision).toBe("approval_required");
  });

  it("allows notification", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "notification",
      resource: "Build complete",
      riskLevel: "low",
      proposedAction: "execute",
    });
    expect(result.decision).toBe("allow");
  });

  it("requires approval for network.request", () => {
    const result = broker.evaluate({
      actorId: "agent-1",
      capability: "network.request",
      resource: "https://api.example.com",
      riskLevel: "medium",
      proposedAction: "execute",
    });
    expect(result.decision).toBe("approval_required");
  });

  it("returns default risk levels correctly", () => {
    expect(broker.getDefaultRisk("file.read")).toBe("low");
    expect(broker.getDefaultRisk("file.write")).toBe("medium");
    expect(broker.getDefaultRisk("file.delete")).toBe("high");
    expect(broker.getDefaultRisk("shell.exec")).toBe("critical");
    expect(broker.getDefaultRisk("screenshot")).toBe("high");
    expect(broker.getDefaultRisk("notification")).toBe("low");
  });
});
