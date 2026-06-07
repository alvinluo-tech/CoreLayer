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
  AgentStreamRunResult,
  ToolCallTrace,
  ApprovalRequest,
  ArtifactRef,
} from "./agent-run.js";

// Streaming Agent Run (Phase 1)
export { runStreamTurn } from "./run-stream-executor.js";
export type { RunStreamTurnOptions } from "./run-stream-executor.js";

// Context Resolver (Phase 5)
export { resolveRunContext } from "./run-context.js";
export type { RunContext } from "./run-context.js";

// Approval Manager (Phase 4)
export { ApprovalManager } from "./approval-manager.js";

// Runtime Component Contract (Phase 8)
export type {
  RuntimeKind,
  RuntimeStatus,
  RestartPolicy,
  RuntimeComponent,
} from "./contract.js";
export { ALL_RUNTIME_KINDS } from "./contract.js";
