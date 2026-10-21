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
export { registerDelegationTools } from "./adapters/native-tools/delegation.js";
export { registerTaskGraphTools } from "./adapters/native-tools/task-graph.js";
export { registerCodeIntelligenceTools } from "./adapters/native-tools/code-intelligence.js";
export { registerToolDiscoveryTools } from "./adapters/native-tools/tool-discovery.js";
export { getDynamicToolRouter, DynamicToolRouter } from "./routing/tool-router.js";

import { toolRuntime } from "./application/execute-tool.js";
import { getRegistry, registerJarvisTool, registerTool, getTool, getAllJarvisTools, getAllTools } from "./adapters/native-tools/registry.js";
import { wrapToolsForAI, trimToolResult, isApprovalRequiredMarker, extractApprovalRequestIds } from "./adapters/ai-tool-wrapper.js";
import { registerTaskFlowAdapter } from "./adapters/native-tools/taskflow.js";
import { registerDelegationTools } from "./adapters/native-tools/delegation.js";
import { registerTaskGraphTools } from "./adapters/native-tools/task-graph.js";
import { registerCodeIntelligenceTools } from "./adapters/native-tools/code-intelligence.js";
import { registerToolDiscoveryTools } from "./adapters/native-tools/tool-discovery.js";
import { getDynamicToolRouter } from "./routing/tool-router.js";

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
  registerDelegationTools,
  registerTaskGraphTools,
  registerCodeIntelligenceTools,
  registerToolDiscoveryTools,
  getDynamicToolRouter,
} as const;
