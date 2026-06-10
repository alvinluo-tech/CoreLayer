import { describe, it, expect } from "vitest";
import { canAutoApprove, validatePermissionMemory } from "../capability-policy.js";

describe("capability-policy", () => {
  describe("canAutoApprove", () => {
    it("allows auto-approve for low risk", () => {
      expect(canAutoApprove("low")).toBe(true);
    });

    it("allows auto-approve for medium risk", () => {
      expect(canAutoApprove("medium")).toBe(true);
    });

    it("rejects auto-approve for high risk", () => {
      expect(canAutoApprove("high")).toBe(false);
    });

    it("rejects auto-approve for critical risk", () => {
      expect(canAutoApprove("critical")).toBe(false);
    });
  });

  describe("validatePermissionMemory", () => {
    it("allows auto for low risk", () => {
      const result = validatePermissionMemory("auto", "low", "global");
      expect(result.allowed).toBe(true);
    });

    it("rejects auto for high risk", () => {
      const result = validatePermissionMemory("auto", "high", "global");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("high");
      }
    });

    it("rejects auto for critical risk", () => {
      const result = validatePermissionMemory("auto", "critical", "global");
      expect(result.allowed).toBe(false);
    });

    it("rejects auto for high risk at global scope", () => {
      const result = validatePermissionMemory("auto", "high", "global");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("high");
      }
    });

    it("allows confirm for any risk", () => {
      expect(validatePermissionMemory("confirm", "critical", "global").allowed).toBe(true);
      expect(validatePermissionMemory("confirm", "high", "global").allowed).toBe(true);
      expect(validatePermissionMemory("confirm", "low", "global").allowed).toBe(true);
    });

    it("allows deny for any risk", () => {
      expect(validatePermissionMemory("deny", "critical", "global").allowed).toBe(true);
      expect(validatePermissionMemory("deny", "high", "global").allowed).toBe(true);
    });
  });
});
