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
export { wrapToolsForAI, trimToolResult } from "./adapters/ai-tool-wrapper.js";
