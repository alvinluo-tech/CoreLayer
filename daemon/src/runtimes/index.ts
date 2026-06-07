/**
 * Runtime facades and domain re-exports.
 *
 * Instantiates all runtime singletons and re-exports business functions
 * that API routes need. Registry/lifecycle/status logic lives in
 * runtime-host/ — this file only creates instances and re-exports.
 */

import { registerRuntime } from "../runtime-host/registry.js";
import { AgentRuntime } from "./agent-runtime/index.js";
import { VoiceRuntime } from "./voice/voice-runtime.js";
import { SchedulerRuntime } from "./scheduler/scheduler-runtime.js";
import { ComputerControlRuntime } from "./computer-control/computer-control-runtime-facade.js";
import { ToolRuntime as ToolExecutor } from "./tool/application/execute-tool.js";

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
registerRuntime("agent", agentRuntime);

// Re-export agent domain functions (delegated to existing modules)
export { runTurn } from "./agent/run.js";
export type { RunTurnOptions } from "./agent/run.js";
export { runStreamTurn } from "./agent/stream.js";
export type { RunStreamTurnOptions } from "./agent/stream.js";
export { ContextBuilder } from "../orchestrator/context-builder.js";
export { isGoalCommand, handleGoalCommand } from "../orchestrator/goal-handler.js";
export { wrapToolsForAI, trimToolResult } from "./tool/adapters/ai-tool-wrapper.js";

// ─── Tool Runtime ─────────────────────────────────────────────────────────────

// Singleton instance of the tool execution runtime (permission guard, audit, etc.)
export const toolRuntime = new ToolExecutor();

// Re-export tool domain functions
export { getRegistry } from "../tools/registry.js";
export type { ToolExecutionContext, ToolExecutionResult } from "./tool/application/execute-tool.js";

// ─── Voice Runtime ────────────────────────────────────────────────────────────

export const voiceRuntime = new VoiceRuntime({
  id: "voice-runtime",
  kind: "voice",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("voice", voiceRuntime);

// Re-export voice domain functions
export { transcribeWithGroq, isAsrAvailable } from "./voice/asr.js";
export { synthesizeSpeech, isTtsAvailable } from "./voice/tts.js";
export type { TTSModel } from "./voice/tts.js";
export { StreamingTTS } from "./voice/streaming-tts.js";
export { voiceRegistry } from "./voice/providers.js";
export { getProviderConfig } from "../gateways/ai-provider/provider.js";

// ─── Scheduler Runtime ────────────────────────────────────────────────────────

export const schedulerRuntime = new SchedulerRuntime({
  id: "scheduler-runtime",
  kind: "scheduler",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("scheduler", schedulerRuntime);

// Re-export scheduler domain functions
export { triggerTask, computeNextRun } from "./scheduler/scheduler.js";
export { parseNlTimeToCron } from "../utils/nl-time-parse.js";

// ─── Computer Control Runtime ─────────────────────────────────────────────────

export const computerControlRuntime = new ComputerControlRuntime({
  id: "computer-control-runtime",
  kind: "computer-control",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("computer-control", computerControlRuntime);

// ─── Memory ───────────────────────────────────────────────────────────────────

// Re-export memory domain functions
export { registerMemoryTools } from "./memory/connector.js";
export { extractTimeClues, mapToDateTimeRange } from "./memory/temporal-memory.js";

// ─── Shared ───────────────────────────────────────────────────────────────────

export { getRepositories } from "../persistence/factory.js";
export { configManager } from "../config/config-manager.js";
export { apiError, extractErrorMessage, classifyError, logError } from "../utils/errors.js";

// ─── Runtime Contract Types ───────────────────────────────────────────────────

export type { RuntimeComponent, RuntimeComponentKind, RuntimeStatus, RestartPolicy } from "../runtime-host/contract.js";
export { ALL_RUNTIME_KINDS } from "../runtime-host/contract.js";
