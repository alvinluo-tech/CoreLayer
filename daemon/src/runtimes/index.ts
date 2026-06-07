/**
 * Central runtime registry.
 *
 * Instantiates all runtime singletons and re-exports business functions
 * that API routes need. This is the single import point for API routes —
 * they should NOT import from internal modules directly.
 */

import type { ManagedRuntime } from "@jarvis/runtime-core";
import type { RuntimeComponentKind } from "../runtime/contract.js";
import { AgentRuntime } from "./agent-runtime/index.js";
import { VoiceRuntime } from "./voice-runtime/index.js";
import { SchedulerRuntime } from "./scheduler-runtime/index.js";
import { ComputerControlRuntime } from "./computer-control-runtime/index.js";
import { ToolRuntime as ToolExecutor } from "../runtime/tool-runtime.js";

// Default config for in-process runtimes (no separate process, no HTTP port)
const runtimeDefaults = {
  appDataPath: "",
  logPath: "",
};

// ─── Agent Runtime ────────────────────────────────────────────────────────────

export const agentRuntime = new AgentRuntime({
  id: "agent-runtime",
  kind: "agent",
  version: "1.0.0",
  ...runtimeDefaults,
});

// Re-export agent domain functions (delegated to existing modules)
export { runTurn } from "../runtime/run-executor.js";
export type { RunTurnOptions } from "../runtime/run-executor.js";
export { runStreamTurn } from "../runtime/run-stream-executor.js";
export type { RunStreamTurnOptions } from "../runtime/run-stream-executor.js";
export { ContextBuilder } from "../orchestrator/context-builder.js";
export { isGoalCommand, handleGoalCommand } from "../orchestrator/goal-handler.js";
export { wrapToolsForAI, trimToolResult } from "../runtime/ai-tool-wrapper.js";

// ─── Tool Runtime ─────────────────────────────────────────────────────────────

// Singleton instance of the tool execution runtime (permission guard, audit, etc.)
export const toolRuntime = new ToolExecutor();

// Re-export tool domain functions
export { getRegistry } from "../tools/registry.js";
export type { ToolExecutionContext, ToolExecutionResult } from "../runtime/tool-runtime.js";

// ─── Voice Runtime ────────────────────────────────────────────────────────────

export const voiceRuntime = new VoiceRuntime({
  id: "voice-runtime",
  kind: "voice",
  version: "1.0.0",
  ...runtimeDefaults,
});

// Re-export voice domain functions
export { transcribeWithGroq, isAsrAvailable } from "../voice/asr.js";
export { synthesizeSpeech, isTtsAvailable } from "../voice/tts.js";
export type { TTSModel } from "../voice/tts.js";
export { StreamingTTS } from "../voice/streaming-tts.js";
export { voiceRegistry } from "../voice/providers.js";
export { getProviderConfig } from "../ai/provider.js";

// ─── Scheduler Runtime ────────────────────────────────────────────────────────

export const schedulerRuntime = new SchedulerRuntime({
  id: "scheduler-runtime",
  kind: "scheduler",
  version: "1.0.0",
  ...runtimeDefaults,
});

// Re-export scheduler domain functions
export { triggerTask, computeNextRun } from "../scheduler.js";
export { parseNlTimeToCron } from "../utils/nl-time-parse.js";

// ─── Computer Control Runtime ─────────────────────────────────────────────────

export const computerControlRuntime = new ComputerControlRuntime({
  id: "computer-control-runtime",
  kind: "computer-control",
  version: "1.0.0",
  ...runtimeDefaults,
});

// ─── Shared ───────────────────────────────────────────────────────────────────

export { getRepositories } from "../db/factory.js";
export { configManager } from "../config/config-manager.js";
export { apiError, extractErrorMessage, classifyError, logError } from "../utils/errors.js";

// ─── Runtime Contract Types ───────────────────────────────────────────────────

export type { RuntimeComponent, RuntimeComponentKind, RuntimeStatus, RestartPolicy } from "../runtime/contract.js";
export { ALL_RUNTIME_KINDS } from "../runtime/contract.js";

// ─── Daemon-side Runtime Registry ─────────────────────────────────────────────

/**
 * Map of runtime kind → ManagedRuntime instance.
 * Only runtimes implementing the ManagedRuntime interface (with start())
 * are registered here. The legacy ToolRuntime is excluded until it is
 * migrated to the protocol-wrapped version.
 */
const runtimeInstances = new Map<RuntimeComponentKind, ManagedRuntime>([
  ["agent", agentRuntime],
  ["voice", voiceRuntime],
  ["scheduler", schedulerRuntime],
  ["computer-control", computerControlRuntime],
]);

/**
 * Get all registered runtime instances.
 */
export function getRuntimeInstances(): Map<RuntimeComponentKind, ManagedRuntime> {
  return runtimeInstances;
}

/**
 * Get a single runtime instance by kind.
 */
export function getRuntimeInstance(kind: RuntimeComponentKind): ManagedRuntime | undefined {
  return runtimeInstances.get(kind);
}

/**
 * Start all registered runtime instances.
 *
 * Scope: start() only initializes lifecycle/status (timestamp, health check,
 * runtime:started event). It must NOT start autonomous scheduler/tick loops
 * or execute side-effect tasks.
 */
export async function startAllRuntimes(): Promise<void> {
  for (const [kind, runtime] of runtimeInstances) {
    try {
      await runtime.start();
      console.log(`[Jarvis] Runtime "${kind}" started`);
    } catch (error) {
      console.error(`[Jarvis] Runtime "${kind}" failed to start:`, error);
    }
  }
}
