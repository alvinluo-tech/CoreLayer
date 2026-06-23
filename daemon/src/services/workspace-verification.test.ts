import { describe, it, expect, beforeEach, vi } from "vitest";

const mockEmitWorkspaceEvent = vi.fn();

vi.mock("./workspace-event-emitter.js", () => ({
  emitWorkspaceEvent: (...args: unknown[]) => mockEmitWorkspaceEvent(...args),
}));

const { emitVerificationEvent } = await import("./workspace-verification.js");

describe("emitVerificationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitWorkspaceEvent.mockResolvedValue(undefined);
  });

  it("should emit passed event for exit code 0", async () => {
    await emitVerificationEvent({
      workspaceId: "ws-1",
      projectId: "proj-1",
      command: "pnpm test",
      exitCode: 0,
      output: "All tests passed",
    });

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith({
      type: "workspace.verification.completed",
      title: "pnpm test passed",
      summary: "All tests passed",
      severity: "success",
      workspaceId: "ws-1",
      projectId: "proj-1",
      taskId: undefined,
      agentRunId: undefined,
      payload: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        taskId: undefined,
        agentRunId: undefined,
        command: "pnpm test",
        exitCode: 0,
        passed: true,
        summary: "All tests passed",
      },
    });
  });

  it("should emit failed event for non-zero exit code", async () => {
    await emitVerificationEvent({
      workspaceId: "ws-1",
      command: "tsc --noEmit",
      exitCode: 1,
      output: "error TS2322: Type 'string' is not assignable to type 'number'",
    });

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace.verification.completed",
        title: "tsc --noEmit failed",
        severity: "error",
        payload: expect.objectContaining({
          exitCode: 1,
          passed: false,
        }),
      }),
    );
  });

  it("should truncate long output to 200 chars", async () => {
    const longOutput = "x".repeat(300);

    await emitVerificationEvent({
      workspaceId: "ws-1",
      command: "pnpm lint",
      exitCode: 1,
      output: longOutput,
    });

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "x".repeat(200),
      }),
    );
  });

  it("should use default summary when no output provided", async () => {
    await emitVerificationEvent({
      workspaceId: "ws-1",
      command: "pnpm build",
      exitCode: 0,
    });

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Passed",
      }),
    );
  });

  it("should include optional IDs in payload", async () => {
    await emitVerificationEvent({
      workspaceId: "ws-1",
      projectId: "proj-1",
      taskId: "task-1",
      agentRunId: "run-1",
      command: "pnpm test",
      exitCode: 0,
    });

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          workspaceId: "ws-1",
          projectId: "proj-1",
          taskId: "task-1",
          agentRunId: "run-1",
        }),
      }),
    );
  });
});
