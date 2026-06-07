/**
 * Central runtime registry.
 *
 * Instantiates all runtime singletons and re-exports business functions
 * that API routes need. This is the single import point for API routes —
 * they should NOT import from internal modules directly.
 */

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
