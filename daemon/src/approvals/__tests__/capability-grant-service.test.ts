import { describe, it, expect } from "vitest";
import { generatePermissionPackage, GRANT_PROFILES } from "../capability-grant-service.js";

describe("generatePermissionPackage", () => {
  it("should select coding_standard for typical coding task", () => {
    const result = generatePermissionPackage({
      goal: "Fix the bug",
      workspaceId: "ws-1",
      expectedActions: ["file.read", "file.write", "git.read", "shell.exec"],
    });

    expect(result.requestedProfiles).toContain("coding_standard");
    expect(result.humanPreview).toContain("Fix the bug");
  });

  it("should select read_only for read-only task", () => {
    const result = generatePermissionPackage({
      goal: "Analyze code",
      workspaceId: "ws-1",
      expectedActions: ["file.read", "git.read"],
    });

    expect(result.requestedProfiles).toContain("read_only");
  });

  it("should select workspace_write for file editing", () => {
    const result = generatePermissionPackage({
      goal: "Update docs",
      workspaceId: "ws-1",
      expectedActions: ["file.read", "file.write", "git.read"],
    });

    expect(result.requestedProfiles).toContain("workspace_write");
  });

  it("should include human preview", () => {
    const result = generatePermissionPackage({
      goal: "Add tests",
      workspaceId: "ws-1",
      expectedActions: ["file.read", "file.write"],
      forbiddenActions: ["git.write"],
    });

    expect(result.humanPreview).toContain("Add tests");
    expect(result.humanPreview).toContain("file.read");
    expect(result.humanPreview).toContain("Forbidden");
  });

  it("should handle empty expected actions", () => {
    const result = generatePermissionPackage({
      goal: "Do nothing",
      workspaceId: "ws-1",
      expectedActions: [],
    });

    expect(result.requestedProfiles).toBeDefined();
  });
});

describe("GRANT_PROFILES", () => {
  it("should have all profiles defined", () => {
    expect(Object.keys(GRANT_PROFILES)).toHaveLength(8);
  });

  it("should have actions for each profile", () => {
    for (const [, profile] of Object.entries(GRANT_PROFILES)) {
      expect(profile.actions.length).toBeGreaterThan(0);
      expect(profile.description).toBeTruthy();
    }
  });
});
