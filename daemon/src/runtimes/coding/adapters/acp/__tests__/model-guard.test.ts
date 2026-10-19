import { describe, it, expect } from "vitest";
import { validateClaudeModel } from "../model-guard.js";

describe("validateClaudeModel", () => {
  it("accepts DeepSeek model ids", () => {
    for (const model of ["deepseek-v4.1-flash", "deepseek-v4-pro", "deepseek-v4-flash"]) {
      expect(validateClaudeModel(model)).toEqual({ allowed: true, model });
    }
  });

  it("accepts a context hint suffix", () => {
    expect(validateClaudeModel("deepseek-v4-pro[1m]")).toEqual({ allowed: true, model: "deepseek-v4-pro[1m]" });
  });

  it("is case-insensitive on the family name", () => {
    expect(validateClaudeModel("DeepSeek-V4-Pro").allowed).toBe(true);
  });

  it("rejects Claude model labels that a third-party endpoint cannot serve", () => {
    for (const model of ["opus", "sonnet", "claude-sonnet-5", "haiku"]) {
      const verdict = validateClaudeModel(model);
      expect(verdict.allowed).toBe(false);
      expect(verdict.allowed === false && verdict.reason).toContain("DeepSeek");
    }
  });

  it("rejects unrelated providers", () => {
    expect(validateClaudeModel("gpt-5").allowed).toBe(false);
    expect(validateClaudeModel("glm-5.3").allowed).toBe(false);
  });

  it("rejects an unset model instead of letting the CLI choose", () => {
    for (const value of [undefined, "", "   "]) {
      const verdict = validateClaudeModel(value);
      expect(verdict.allowed).toBe(false);
      expect(verdict.allowed === false && verdict.reason).toContain("explicit DeepSeek model");
    }
  });
});
