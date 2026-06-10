import { describe, it, expect } from "vitest";
import {
  checkHardlineBlocklist,
  ALL_BLOCKLIST_RULES,
} from "../hardline-blocklist.js";

describe("hardline-blocklist", () => {
  describe("checkHardlineBlocklist", () => {
    it("blocks rm -rf /", () => {
      const result = checkHardlineBlocklist("rm -rf /");
      expect(result.blocked).toBe(true);
      if (result.blocked) {
        expect(result.rule.reason).toContain("root filesystem");
      }
    });

    it("blocks rm -rf /*", () => {
      const result = checkHardlineBlocklist("rm -rf /*");
      expect(result.blocked).toBe(true);
    });

    it("blocks fork bomb", () => {
      const result = checkHardlineBlocklist(":(){ :|:& };:");
      expect(result.blocked).toBe(true);
    });

    it("blocks push --force", () => {
      const result = checkHardlineBlocklist("git push --force origin main");
      expect(result.blocked).toBe(true);
      if (result.blocked) {
        expect(result.rule.categories).toContain("git");
      }
    });

    it("blocks push -f", () => {
      const result = checkHardlineBlocklist("git push -f");
      expect(result.blocked).toBe(true);
    });

    it("blocks reset --hard", () => {
      const result = checkHardlineBlocklist("git reset --hard HEAD~1");
      expect(result.blocked).toBe(true);
    });

    it("blocks mkfs", () => {
      const result = checkHardlineBlocklist("mkfs.ext4 /dev/sda1");
      expect(result.blocked).toBe(true);
    });

    it("blocks shutdown", () => {
      const result = checkHardlineBlocklist("shutdown -h now");
      expect(result.blocked).toBe(true);
    });

    it("allows safe commands", () => {
      const result = checkHardlineBlocklist("git status");
      expect(result.blocked).toBe(false);
    });

    it("allows ls", () => {
      const result = checkHardlineBlocklist("ls -la");
      expect(result.blocked).toBe(false);
    });

    it("allows cat", () => {
      const result = checkHardlineBlocklist("cat file.txt");
      expect(result.blocked).toBe(false);
    });

    it("filters by category", () => {
      const result = checkHardlineBlocklist("rm -rf /", "git");
      expect(result.blocked).toBe(false);
    });

    it("is case-insensitive", () => {
      const result = checkHardlineBlocklist("RM -RF /");
      expect(result.blocked).toBe(true);
    });
  });

  describe("ALL_BLOCKLIST_RULES", () => {
    it("has rules for shell, file, and git categories", () => {
      const categories = new Set(ALL_BLOCKLIST_RULES.flatMap((r) => r.categories));
      expect(categories.has("shell")).toBe(true);
      expect(categories.has("file")).toBe(true);
      expect(categories.has("git")).toBe(true);
    });

    it("every rule has a pattern and reason", () => {
      for (const rule of ALL_BLOCKLIST_RULES) {
        expect(rule.pattern).toBeTruthy();
        expect(rule.reason).toBeTruthy();
      }
    });
  });
});
