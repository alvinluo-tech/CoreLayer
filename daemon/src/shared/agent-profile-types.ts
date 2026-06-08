/**
 * Typed interfaces for AgentProfile's modelPolicy and executorPolicy JSON fields.
 * These replace the untyped `unknown` in the repository layer.
 */

/** Which executor runs this agent's tasks */
export type ExecutorType = "self" | "codex" | "claude-code" | "opencode";

/** Model preference policy — controls model selection */
export interface AgentModelPolicy {
  /** Ordered list of preferred model IDs (e.g. ["claude-opus-4-5", "claude-sonnet-4-6"]) */
  preferredModels?: string[];
  /** Fallback model when no preferred model is available */
  fallbackModel?: string;
  /** Maximum output tokens per request */
  maxTokens?: number;
  /** Sampling temperature (0.0–2.0) */
  temperature?: number;
  /** Preferred provider (e.g. "anthropic", "openai") */
  provider?: string;
}

/** Executor configuration policy — controls how and where tasks execute */
export interface AgentExecutorPolicy {
  /** Which executor to use */
  executor: ExecutorType;
  /** Maximum concurrent runs for this agent */
  maxConcurrent?: number;
  /** Working directory for coding executors */
  workDir?: string;
  /** Extra CLI args to pass to the executor */
  extraArgs?: string[];
}

/** Valid executor type values for validation */
export const VALID_EXECUTORS: readonly ExecutorType[] = [
  "self",
  "codex",
  "claude-code",
  "opencode",
];

/**
 * Check whether a value is a valid ExecutorType.
 */
export function isValidExecutor(value: unknown): value is ExecutorType {
  return typeof value === "string" && (VALID_EXECUTORS as readonly string[]).includes(value);
}

/**
 * Check whether a value conforms to the AgentModelPolicy shape (loose structural check).
 */
export function isAgentModelPolicy(value: unknown): value is AgentModelPolicy {
  if (value == null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (obj.preferredModels !== undefined && !Array.isArray(obj.preferredModels)) return false;
  if (obj.fallbackModel !== undefined && typeof obj.fallbackModel !== "string") return false;
  if (obj.maxTokens !== undefined && typeof obj.maxTokens !== "number") return false;
  if (obj.temperature !== undefined && typeof obj.temperature !== "number") return false;
  if (obj.provider !== undefined && typeof obj.provider !== "string") return false;
  return true;
}

/**
 * Check whether a value conforms to the AgentExecutorPolicy shape (loose structural check).
 */
export function isAgentExecutorPolicy(value: unknown): value is AgentExecutorPolicy {
  if (value == null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (obj.executor === undefined || !isValidExecutor(obj.executor)) return false;
  if (obj.maxConcurrent !== undefined && typeof obj.maxConcurrent !== "number") return false;
  if (obj.workDir !== undefined && typeof obj.workDir !== "string") return false;
  if (obj.extraArgs !== undefined && !Array.isArray(obj.extraArgs)) return false;
  return true;
}
