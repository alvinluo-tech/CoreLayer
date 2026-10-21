/**
 * `dispatch_agent` — hand a self-contained job to another agent run.
 *
 * The calling agent decides *what* needs doing and *which* parts of the repo it
 * may touch; the dispatcher owns isolation (a worktree per run), the budget,
 * and the record of what was actually granted. The caller cannot see or raise
 * its own bounds — see `delegation-bounds.ts` for why that direction is the
 * only one allowed.
 */

import { tool } from "ai";
import { z } from "zod";
import { registerTool } from "./registry.js";
import { currentRunId } from "../../domain/tool-call-id.js";
import type { dispatchAgent as dispatchAgentFn } from "../../../../workflow/delegation-service.js";
import { MAX_DELEGATION_TIMEOUT_MS } from "../../../../workflow/delegation-bounds.js";

interface DispatchAgentArgs {
  task: string;
  allowedPaths?: string[];
  testCommands?: string[];
  requiredArtifactTypes?: string[];
  timeoutMs?: number;
  wait?: boolean;
  waitTimeoutMs?: number;
}

export interface DelegationToolDeps {
  /** Injected so the tool can be tested without a database behind it. */
  dispatch: typeof dispatchAgentFn;
  /** Namespace marker on refusals; see the catch below. */
  isRejection: (error: unknown) => boolean;
}

export function registerDelegationTools(deps?: Partial<DelegationToolDeps>): number {
  let cached: DelegationToolDeps | null = null;
  const resolveDeps = async (): Promise<DelegationToolDeps> => {
    if (cached) return cached;
    // Loaded lazily: the delegation service reaches the persistence layer, and
    // bootstrapping tools must not pull the database in at registration time.
    const service = await import("../../../../workflow/delegation-service.js");
    const bounds = await import("../../../../workflow/delegation-bounds.js");
    cached = {
      dispatch: deps?.dispatch ?? service.dispatchAgent,
      isRejection: deps?.isRejection ?? ((error: unknown) => error instanceof bounds.DelegationRejected),
    };
    return cached;
  };

  registerTool("dispatch_agent", tool({
    description:
      "Delegate a self-contained coding job to another agent run in an isolated worktree. " +
      "Give it one clear objective. You may narrow where it works (allowedPaths), require checks " +
      "(testCommands), and cap its time; you cannot widen its scope beyond your own. " +
      "Returns the child run's status and deliverables. Use wait=false for long jobs and poll later.",
    parameters: z.object({
      task: z.string().min(1).describe("A complete, self-contained instruction for the child agent"),
      allowedPaths: z
        .array(z.string())
        .optional()
        .describe("Glob patterns the child may modify, e.g. ['src/auth/**']. Must be inside your own scope"),
      testCommands: z
        .array(z.string())
        .optional()
        .describe("Commands the child's work must pass before it counts as done"),
      requiredArtifactTypes: z
        .array(z.string())
        .optional()
        .describe("Artifact types the child must produce, e.g. ['changed_files']"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .max(MAX_DELEGATION_TIMEOUT_MS)
        .optional()
        .describe("Wall-clock budget for the child run, in milliseconds"),
      wait: z
        .boolean()
        .optional()
        .describe("Wait for the child to finish (default true). Set false to return immediately"),
      waitTimeoutMs: z
        .number()
        .int()
        .positive()
        .max(MAX_DELEGATION_TIMEOUT_MS)
        .optional()
        .describe("How long to wait before returning the child as still running"),
    }),
    execute: async (args: DispatchAgentArgs) => {
      const parentRunId = currentRunId();
      if (!parentRunId) {
        throw new Error(
          "dispatch_agent is only available inside an agent run; there is no parent run to delegate from",
        );
      }
      const { dispatch, isRejection } = await resolveDeps();
      try {
        const result = await dispatch({
          parentRunId,
          task: args.task,
          ...(args.allowedPaths ? { allowedPaths: args.allowedPaths } : {}),
          ...(args.testCommands ? { testCommands: args.testCommands } : {}),
          ...(args.requiredArtifactTypes ? { requiredArtifactTypes: args.requiredArtifactTypes } : {}),
          ...(args.timeoutMs ? { timeoutMs: args.timeoutMs } : {}),
          ...(args.wait !== undefined ? { wait: args.wait } : {}),
          ...(args.waitTimeoutMs ? { waitTimeoutMs: args.waitTimeoutMs } : {}),
        });
        return {
          ...result,
          // Say plainly what a still-running result means; a caller that reads
          // only `status` would otherwise treat `queued` as finished.
          note: result.stillRunning
            ? "The child is still running. Check it again later; do not assume its work exists yet."
            : result.status === "succeeded"
              ? "The child finished successfully."
              : `The child ended with status ${result.status}.`,
        };
      } catch (error) {
        if (isRejection(error)) {
          // A refusal is an answer, not a crash: the caller should re-plan with
          // narrower bounds rather than retry the same request.
          return { status: "rejected" as const, error: (error as Error).message };
        }
        throw error;
      }
    },
  } as never));

  return 1;
}
