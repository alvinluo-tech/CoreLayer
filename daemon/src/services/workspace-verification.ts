/**
 * Workspace Verification — helper for emitting verification events.
 *
 * Verification events track test runs, typecheck results, and other
 * validation commands. Currently emitted from runtime completion paths;
 * provides a clean extension point for future command-level verification.
 */

import { emitWorkspaceEvent } from "./workspace-event-emitter.js";

export interface EmitVerificationEventInput {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  agentRunId?: string;
  command: string;
  exitCode: number;
  output?: string;
}

/**
 * Emit a verification completed event.
 * Convenience wrapper around emitWorkspaceEvent for verification results.
 */
export async function emitVerificationEvent(
  input: EmitVerificationEventInput,
): Promise<void> {
  const passed = input.exitCode === 0;
  const summary = input.output
    ? input.output.slice(0, 200)
    : passed
      ? "Passed"
      : `Failed with exit code ${input.exitCode}`;

  await emitWorkspaceEvent({
    type: "workspace.verification.completed",
    title: `${input.command} ${passed ? "passed" : "failed"}`,
    summary,
    severity: passed ? "success" : "error",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    agentRunId: input.agentRunId,
    payload: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      agentRunId: input.agentRunId,
      command: input.command,
      exitCode: input.exitCode,
      passed,
      summary,
    },
  });
}
