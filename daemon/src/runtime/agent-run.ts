/**
 * Unified Agent Run interface for Agent OS Task-Centric architecture.
 *
 * All execution paths (chat, voice, tick, scheduled, workflow) converge
 * through `runTurn()`, which yields structured events throughout the run.
 */

// ---- Request ----

export interface AgentRunRequest {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  conversationId?: string;
  agentId: string;
  mode: "chat" | "voice" | "tick" | "scheduled" | "workflow";
  input: string;
  modelOverride?: string;
  constraints?: {
    maxSteps?: number;
    maxTokens?: number;
    requireApproval?: boolean;
    autoCompleteTask?: boolean;
  };
}

// ---- Events ----

export interface ToolCallTrace {
  name: string;
  args: unknown;
  result?: unknown;
  durationMs?: number;
}

export interface ApprovalRequest {
  toolName: string;
  args: unknown;
  risk: "low" | "medium" | "high" | "critical";
}

export interface ArtifactRef {
  type: string;
  id: string;
  uri?: string;
}

export type AgentRunEvent =
  | { type: "run_started"; runId: string; mode: string }
  | { type: "model_selected"; modelId: string }
  | { type: "memory_read"; memoryIds: string[] }
  | { type: "tool_call"; toolCall: ToolCallTrace }
  | { type: "approval_required"; approval: ApprovalRequest }
  | { type: "artifact_created"; artifact: ArtifactRef }
  | { type: "memory_written"; memoryIds: string[] }
  | { type: "task_blocked"; taskId: string; blockedBy: string[] }
  | { type: "task_dependency_resolved"; taskId: string; dependencyId: string }
  | { type: "delta"; text: string }
  | { type: "run_completed"; result: { text: string; conversationId: string } }
  | { type: "run_failed"; error: string };

// ---- Result ----

export interface AgentRunResult {
  runId: string;
  conversationId: string;
  text: string;
  events: AgentRunEvent[];
}

// ---- Streaming Result ----

export interface AgentStreamRunResult {
  runId: string;
  conversationId: string;
  stream: AsyncIterable<AgentRunEvent>;
  abortController: AbortController;
}

// ---- Entry points ----

/**
 * Non-streaming entry point for all agent execution.
 * Defined in run-executor.ts.
 */
export declare function runTurn(
  request: AgentRunRequest,
  options?: { onEvent?: (event: AgentRunEvent) => void },
): Promise<AgentRunResult>;

/**
 * Streaming entry point for all agent execution.
 * Defined in run-stream-executor.ts.
 */
export declare function runStreamTurn(
  request: AgentRunRequest,
  options?: { onEvent?: (event: AgentRunEvent) => void; abortController?: AbortController },
): Promise<AgentStreamRunResult>;
