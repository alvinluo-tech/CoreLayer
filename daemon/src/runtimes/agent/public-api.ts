/**
 * Agent Runtime — public API surface (runtime boundary).
 *
 * This is the ONLY module that HTTP routes and scheduler may import from
 * the agent runtime. Internal implementation details (application/, domain/)
 * are not exposed.
 *
 * Boundary rule: http/routes/*, scheduler/* → public-api.ts → application/domain/*
 *
 * Future: will evolve into a command facade / protocol client when runtimes
 * move to separate processes.
 */

export { runTurn, cancelActiveRun } from "./run.js";
export { runStreamTurn } from "./stream.js";
export { handleMessageInConversation } from "./application/conversation.js";
export { isGoalCommand, handleGoalCommand, GoalJudge } from "./application/goal-handler.js";
export { ContextBuilder } from "./application/context-builder.js";
export { decomposeTask } from "./application/task-decomposer.js";
export { buildTickSystemPrompt } from "./application/prompt-builder.js";
export { compressConversation } from "./application/compressor.js";
export { runAgentLoop, MessageQueue } from "./application/agent-loop.js";
export type { AgentLoopConfig, DeliveryMode } from "./application/agent-loop.js";

import { runTurn, cancelActiveRun } from "./run.js";
import { runStreamTurn } from "./stream.js";
import { handleMessageInConversation } from "./application/conversation.js";
import { isGoalCommand, handleGoalCommand, GoalJudge } from "./application/goal-handler.js";
import { ContextBuilder } from "./application/context-builder.js";
import { decomposeTask } from "./application/task-decomposer.js";
import { buildTickSystemPrompt } from "./application/prompt-builder.js";
import { compressConversation } from "./application/compressor.js";
import { runAgentLoop, MessageQueue } from "./application/agent-loop.js";

/** Facade — prefer importing this object over individual named exports. */
export const agentRuntimeApi = {
  runTurn,
  cancelActiveRun,
  runStreamTurn,
  handleMessageInConversation,
  isGoalCommand,
  handleGoalCommand,
  GoalJudge,
  ContextBuilder,
  decomposeTask,
  buildTickSystemPrompt,
  compressConversation,
  runAgentLoop,
  MessageQueue,
} as const;
