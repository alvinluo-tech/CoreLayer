import { describe, expect, it } from "vitest";
import { derivePermissionPolicy } from "../permission-policy.js";

describe("derivePermissionPolicy", () => {
  it("grants normal policy to agents that can write files", () => {
    // The seeded Coding/Testing agents declare file_write + shell_exec.
    // Mapping only on a literal "write" left them on strict, which made
    // the CLI adapter disable Edit/Write/Bash entirely.
    expect(derivePermissionPolicy(["chat", "task_management", "shell_exec", "file_write", "file_read"]))
      .toBe("normal");
  });

  it("treats file_write alone as sufficient", () => {
    expect(derivePermissionPolicy(["file_write"])).toBe("normal");
  });

  it("treats shell_exec alone as sufficient", () => {
    expect(derivePermissionPolicy(["shell_exec"])).toBe("normal");
  });

  it("returns strict for read-only agents", () => {
    expect(derivePermissionPolicy(["chat", "task_management", "file_read"])).toBe("strict");
  });

  it("returns strict for agents with no permissions", () => {
    expect(derivePermissionPolicy([])).toBe("strict");
  });

  it("gives permissive precedence over write capabilities", () => {
    expect(derivePermissionPolicy(["unrestricted", "file_write"])).toBe("permissive");
  });
});
