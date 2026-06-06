import { ToolRuntime } from "./tool-runtime.js";

export const toolRuntime = new ToolRuntime();
export { ToolRuntime };
export type { ToolExecutionContext, ToolExecutionResult } from "./tool-runtime.js";

// Agent Run (Phase 3)
export { runTurn } from "./run-executor.js";
export type { RunTurnOptions } from "./run-executor.js";
export type {
  AgentRunRequest,
  AgentRunEvent,
  AgentRunResult,
  ToolCallTrace,
  ApprovalRequest,
  ArtifactRef,
} from "./agent-run.js";
