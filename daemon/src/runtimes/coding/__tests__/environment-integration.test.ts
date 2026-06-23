import { describe, it, expect } from "vitest";

describe("environment-integration", () => {
  it("should export dispatchWithEnvironment and cleanupEnvironmentSession", async () => {
    // Verify the module exports exist and have correct types
    const mod = await import("../environment-integration.js");
    expect(typeof mod.dispatchWithEnvironment).toBe("function");
    expect(typeof mod.cleanupEnvironmentSession).toBe("function");
    expect(typeof mod.getCodingEnvironment).toBe("function");
  });

  it("getCodingEnvironment should return a git-worktree environment", async () => {
    const { getCodingEnvironment } = await import("../environment-integration.js");
    const env = getCodingEnvironment();
    expect(env.kind).toBe("git-worktree");
  });
});
