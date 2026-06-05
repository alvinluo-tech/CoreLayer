import { describe, it, expect } from "vitest";
import { maskApiKey, isMaskedKey } from "./settings-helpers.js";

describe("maskApiKey", () => {
  it("should return empty string for undefined", () => {
    expect(maskApiKey(undefined)).toBe("");
  });

  it("should return empty string for empty string", () => {
    expect(maskApiKey("")).toBe("");
  });

  it("should return 'ollama' unchanged", () => {
    expect(maskApiKey("ollama")).toBe("ollama");
  });

  it("should return short keys unchanged (length <= 4)", () => {
    expect(maskApiKey("ab")).toBe("ab");
    expect(maskApiKey("abc")).toBe("abc");
    expect(maskApiKey("abcd")).toBe("abcd");
  });

  it("should mask long keys, showing last 4 characters", () => {
    const key = "sk-1234567890abcdef";
    const masked = maskApiKey(key);
    expect(masked).toBe("*".repeat(key.length - 4) + "cdef");
  });

  it("should mask 5-character key", () => {
    expect(maskApiKey("abcde")).toBe("*bcde");
  });

  it("should handle keys with special characters", () => {
    expect(maskApiKey("key-!@#$%^&*()")).toBe("**********&*()");
  });
});

describe("isMaskedKey", () => {
  it("should return true for masked keys", () => {
    expect(isMaskedKey("****abc")).toBe(true);
    expect(isMaskedKey("**************cdef")).toBe(true);
  });

  it("should return false for non-masked keys", () => {
    expect(isMaskedKey("sk-1234567890abcdef")).toBe(false);
    expect(isMaskedKey("abcde")).toBe(false);
    expect(isMaskedKey("")).toBe(false);
  });

  it("should return false for keys with less than 4 asterisks", () => {
    expect(isMaskedKey("***abc")).toBe(false);
    expect(isMaskedKey("*abc")).toBe(false);
  });
});
