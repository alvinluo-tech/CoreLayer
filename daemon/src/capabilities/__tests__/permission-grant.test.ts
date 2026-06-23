import { describe, it, expect, beforeEach } from "vitest";
import {
  createGrant,
  findMatchingGrant,
  useGrant,
  revokeGrant,
  revokeGrantsForScope,
  getGrantsForScope,
  getRiskDefaults,
  resetGrants,
} from "../permission-grant.js";

describe("PermissionGrant", () => {
  beforeEach(() => {
    resetGrants();
  });

  describe("createGrant", () => {
    it("should create a grant with id and metadata", () => {
      const grant = createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: { maxUses: 10 },
        source: "explicit_user",
        riskLevel: "medium",
      });

      expect(grant.id).toBeDefined();
      expect(grant.useCount).toBe(0);
      expect(grant.createdAt).toBeDefined();
      expect(grant.subject.agentId).toBe("agent-1");
    });
  });

  describe("findMatchingGrant", () => {
    it("should find a matching grant", () => {
      createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "medium",
      });

      const found = findMatchingGrant("agent-1", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium");
      expect(found).not.toBeNull();
    });

    it("should not find grant for different agent", () => {
      createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "medium",
      });

      const found = findMatchingGrant("agent-2", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium");
      expect(found).toBeNull();
    });

    it("should not find grant for different action", () => {
      createGrant({
        subject: { agentId: "agent-1" },
        action: "file.read",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "low",
      });

      const found = findMatchingGrant("agent-1", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium");
      expect(found).toBeNull();
    });

    it("should not find expired grant", () => {
      createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: { expiresAt: "2020-01-01T00:00:00Z" },
        source: "explicit_user",
        riskLevel: "medium",
      });

      const found = findMatchingGrant("agent-1", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium");
      expect(found).toBeNull();
    });

    it("should not find grant exceeded max uses", () => {
      const grant = createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: { maxUses: 1 },
        source: "explicit_user",
        riskLevel: "medium",
      });

      useGrant(grant.id);
      const found = findMatchingGrant("agent-1", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium");
      expect(found).toBeNull();
    });

    it("should match broader scope grant", () => {
      createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "project", id: "proj-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "medium",
      });

      // Grant is at project level, request is at run level
      const found = findMatchingGrant("agent-1", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium");
      expect(found).not.toBeNull();
    });

    it("should cover higher risk with critical grant", () => {
      createGrant({
        subject: { agentId: "agent-1" },
        action: "shell.exec",
        resourcePattern: "**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "critical",
      });

      const found = findMatchingGrant("agent-1", "shell.exec", "rm -rf /", { level: "run", id: "run-1" }, "high");
      expect(found).not.toBeNull();
    });
  });

  describe("useGrant", () => {
    it("should increment use count", () => {
      const grant = createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "medium",
      });

      useGrant(grant.id);
      useGrant(grant.id);

      const found = findMatchingGrant("agent-1", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium");
      expect(found!.useCount).toBe(2);
    });
  });

  describe("revokeGrant", () => {
    it("should revoke a grant", () => {
      const grant = createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "medium",
      });

      expect(revokeGrant(grant.id)).toBe(true);
      expect(findMatchingGrant("agent-1", "file.write", "src/index.ts", { level: "run", id: "run-1" }, "medium")).toBeNull();
    });
  });

  describe("revokeGrantsForScope", () => {
    it("should revoke all grants for a scope", () => {
      createGrant({
        subject: { agentId: "agent-1" },
        action: "file.write",
        resourcePattern: "src/**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "medium",
      });
      createGrant({
        subject: { agentId: "agent-1" },
        action: "file.read",
        resourcePattern: "**",
        scope: { level: "run", id: "run-1" },
        constraints: {},
        source: "explicit_user",
        riskLevel: "low",
      });

      const count = revokeGrantsForScope("run", "run-1");
      expect(count).toBe(2);
      expect(getGrantsForScope("run", "run-1")).toHaveLength(0);
    });
  });

  describe("getRiskDefaults", () => {
    it("should return risk defaults", () => {
      const defaults = getRiskDefaults();
      expect(defaults.low.autoAllow).toBe(true);
      expect(defaults.medium.autoAllow).toBe(false);
      expect(defaults.high.autoAllow).toBe(false);
      expect(defaults.critical.autoAllow).toBe(false);
    });
  });
});
