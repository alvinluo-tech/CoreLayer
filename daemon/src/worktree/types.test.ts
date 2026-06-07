import { describe, it, expect } from "vitest";
import type {
  ProjectWorkspace,
  AgentRunWorkspace,
  FileConflict,
  WorktreeStatus,
} from "./types.js";

describe("Worktree types", () => {
  it("WorktreeStatus includes all expected values", () => {
    const statuses: WorktreeStatus[] = ["active", "completed", "merged", "abandoned", "conflict"];
    expect(statuses).toHaveLength(5);
  });

  it("ProjectWorkspace has required fields", () => {
    const ws: ProjectWorkspace = {
      id: "1",
      projectId: "p1",
      repoPath: "/tmp/repo",
      defaultBranch: "main",
      workspaceRoot: "/tmp/repo/.jarvis/worktrees",
      createdAt: new Date().toISOString(),
    };
    expect(ws.id).toBe("1");
    expect(ws.defaultBranch).toBe("main");
  });

  it("AgentRunWorkspace has required fields", () => {
    const ws: AgentRunWorkspace = {
      id: "1",
      agentRunId: "run-1",
      projectId: "p1",
      worktreePath: "/tmp/repo/.jarvis/worktrees/run-abc",
      branchName: "agent/abc",
      status: "active",
      changedFiles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(ws.status).toBe("active");
    expect(ws.changedFiles).toEqual([]);
  });

  it("FileConflict references two workspaces", () => {
    const conflict: FileConflict = {
      filePath: "src/main.ts",
      workspaceA: "ws-1",
      workspaceB: "ws-2",
      agentRunA: "run-1",
      agentRunB: "run-2",
    };
    expect(conflict.filePath).toBe("src/main.ts");
    expect(conflict.workspaceA).not.toBe(conflict.workspaceB);
  });
});
