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

export { runTurn } from "./run.js";
export { runStreamTurn } from "./stream.js";
export { handleMessageInConversation } from "./application/conversation.js";
export { isGoalCommand, handleGoalCommand, GoalJudge } from "./application/goal-handler.js";
export { ContextBuilder } from "./application/context-builder.js";
export { decomposeTask } from "./application/task-decomposer.js";
export { buildTickSystemPrompt } from "./application/prompt-builder.js";
export { compressConversation } from "./application/compressor.js";
