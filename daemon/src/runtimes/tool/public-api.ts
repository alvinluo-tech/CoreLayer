/**
 * Tool Runtime — public API surface (runtime boundary).
 *
 * This is the ONLY module that HTTP routes, scheduler, and other runtimes
 * may import from the tool runtime. Internal implementation details
 * (application/, adapters/, domain/) are not exposed.
 *
 * Boundary rule: http/routes/* → public-api.ts → application/adapters/*
 *
 * Future: will evolve into a command facade / protocol client when runtimes
 * move to separate processes.
 */

export { toolRuntime } from "./application/execute-tool.js";
export { getRegistry, registerJarvisTool, registerTool, getTool, getAllJarvisTools, getAllTools } from "./adapters/native-tools/registry.js";
export { wrapToolsForAI, trimToolResult, isApprovalRequiredMarker, extractApprovalRequestIds } from "./adapters/ai-tool-wrapper.js";
export type { AIToolRuntimeContext } from "./adapters/ai-tool-wrapper.js";
export { registerTaskFlowAdapter } from "./adapters/native-tools/taskflow.js";

import { toolRuntime } from "./application/execute-tool.js";
import { getRegistry, registerJarvisTool, registerTool, getTool, getAllJarvisTools, getAllTools } from "./adapters/native-tools/registry.js";
import { wrapToolsForAI, trimToolResult, isApprovalRequiredMarker, extractApprovalRequestIds } from "./adapters/ai-tool-wrapper.js";
import { registerTaskFlowAdapter } from "./adapters/native-tools/taskflow.js";

/** Facade — prefer importing this object over individual named exports. */
export const toolRuntimeApi = {
  execute: toolRuntime.execute.bind(toolRuntime),
  getPermissionGuard: toolRuntime.getPermissionGuard.bind(toolRuntime),
  getRegistry,
  registerJarvisTool,
  registerTool,
  getTool,
  getAllJarvisTools,
  getAllTools,
  wrapToolsForAI,
  trimToolResult,
  isApprovalRequiredMarker,
  extractApprovalRequestIds,
  registerTaskFlowAdapter,
} as const;
