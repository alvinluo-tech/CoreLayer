import { describe, it, expect, beforeEach, vi } from "vitest";

let capturedExecute: ((args: unknown) => Promise<unknown>) | null = null;

vi.mock("../registry.js", () => ({
  registerTool: (_name: string, definition: { execute: (args: unknown) => Promise<unknown> }) => {
    capturedExecute = definition.execute;
  },
}));

// The tool loads its collaborators lazily so registration stays cheap. An
// injected test still triggers that import, so stub the module it reaches for
// rather than pulling the persistence layer into a unit test.
vi.mock("../../../../../workflow/delegation-service.js", () => ({
  dispatchAgent: vi.fn(),
}));
vi.mock("../../../../../workflow/delegation-bounds.js", () => ({
  MAX_DELEGATION_TIMEOUT_MS: 1_800_000,
  DelegationRejected: class DelegationRejected extends Error {},
}));

const { registerDelegationTools } = await import("../delegation.js");
const { withToolInvocationContext } = await import("../../../domain/tool-call-id.js");

/** Stand-in for DelegationRejected, which lives behind the lazily loaded module. */
class FakeRejection extends Error {}

function setup(
  dispatch: (input: Record<string, unknown>) => Promise<unknown>,
): { dispatch: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(dispatch);
  registerDelegationTools({
    dispatch: spy as never,
    isRejection: (error: unknown) => error instanceof FakeRejection,
  });
  return { dispatch: spy };
}

function execute(args: Record<string, unknown>, runId?: string): Promise<unknown> {
  const fn = capturedExecute!;
  return withToolInvocationContext(runId, () => fn(args));
}

beforeEach(() => {
  capturedExecute = null;
});

describe("dispatch_agent", () => {
  it("registers a tool with an execute function", () => {
    setup(async () => ({}));
    expect(capturedExecute).toBeTypeOf("function");
  });

  it("refuses to run outside an agent run", async () => {
    const { dispatch } = setup(async () => ({}));
    await expect(execute({ task: "do it" }, undefined)).rejects.toThrow(/only available inside an agent run/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("delegates with the calling run as parent, not a model-supplied id", async () => {
    const { dispatch } = setup(async () => ({
      childRunId: "child-1",
      status: "succeeded",
      stillRunning: false,
      artifacts: [],
    }));

    await execute({ task: "fix the parser", allowedPaths: ["src/parser/**"] }, "run-42");

    const input = dispatch.mock.calls[0][0] as Record<string, unknown>;
    expect(input.parentRunId).toBe("run-42");
    expect(input.task).toBe("fix the parser");
    expect(input.allowedPaths).toEqual(["src/parser/**"]);
  });

  it("returns a refusal as a result the caller can re-plan from", async () => {
    setup(async () => {
      throw new FakeRejection("paths do not overlap");
    });

    const result = (await execute({ task: "t" }, "run-42")) as { status: string; error: string };

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("do not overlap");
  });

  it("says plainly when the child is still running", async () => {
    setup(async () => ({
      childRunId: "child-1",
      status: "running",
      stillRunning: true,
      artifacts: [],
    }));

    const result = (await execute({ task: "t" }, "run-42")) as { note: string };
    expect(result.note).toMatch(/still running/i);
    expect(result.note).toMatch(/do not assume/i);
  });

  it("lets an unexpected error propagate instead of disguising it as a refusal", async () => {
    setup(async () => {
      throw new Error("database locked");
    });
    await expect(execute({ task: "t" }, "run-42")).rejects.toThrow(/database locked/);
  });
});
