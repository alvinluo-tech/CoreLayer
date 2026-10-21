/**
 * Runtime facades — construction, registration, and public instances.
 *
 * Registry/lifecycle/status logic lives in runtime-host/.
 * Business functions are imported from their direct owners, not re-exported here.
 */

import { registerRuntime } from "../runtime-host/registry.js";
import { AgentRuntime } from "./agent/agent-runtime.js";
import { VoiceRuntime } from "./voice/voice-runtime.js";
import { SchedulerRuntime } from "./scheduler/scheduler-runtime.js";
import { ComputerControlRuntime } from "./computer-control/computer-control-runtime-facade.js";
import { ToolRuntime as ToolRuntimeFacade } from "./tool/tool-runtime.js";
import { CodingRuntime } from "./coding/coding-runtime.js";
import { MemoryRuntime } from "./memory/memory-runtime.js";

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

// ─── Tool Runtime ─────────────────────────────────────────────────────────────

export const toolRuntimeFacade = new ToolRuntimeFacade({
  id: "tool-runtime",
  kind: "tool",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("tool", toolRuntimeFacade);

// ─── Voice Runtime ────────────────────────────────────────────────────────────

export const voiceRuntime = new VoiceRuntime({
  id: "voice-runtime",
  kind: "voice",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("voice", voiceRuntime);

// ─── Scheduler Runtime ────────────────────────────────────────────────────────

export const schedulerRuntime = new SchedulerRuntime({
  id: "scheduler-runtime",
  kind: "scheduler",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("scheduler", schedulerRuntime);

// ─── Computer Control Runtime ─────────────────────────────────────────────────
//
// Deliberately NOT registered with the runtime host yet. The permission, risk
// and audit layers are complete, but `executeOperation` still returns a
// hardcoded success without touching the OS (see computer-control-runtime.ts),
// and no Rust-side capability exists to back it. Registering it would report
// this runtime as "running" through /api/runtime/components and expose tools
// that silently do nothing.

export const computerControlRuntime = new ComputerControlRuntime({
  id: "computer-control-runtime",
  kind: "computer-control",
  version: "1.0.0",
  ...runtimeDefaults,
});

// ─── Coding Runtime ──────────────────────────────────────────────────────────

export const codingRuntime = new CodingRuntime({
  id: "coding-runtime",
  kind: "coding",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("coding", codingRuntime);

// ─── Memory Runtime ───────────────────────────────────────────────────────────

export const memoryRuntime = new MemoryRuntime({
  id: "memory-runtime",
  kind: "memory",
  version: "1.0.0",
  ...runtimeDefaults,
});
registerRuntime("memory", memoryRuntime);
