import { Hono } from "hono";
import type { ToolSource, RiskLevel } from "@jarvis/types";
import { isApprovalRequiredResult } from "@jarvis/runtime-protocol";
import { getRegistry, toolRuntime } from "../../runtimes/tool/public-api.js";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, ErrorCodes } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

app.get(
  "/logs",
  withErrorHandling("tools/logs", async (c) => {
    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    const repos = getRepositories();
    const logs = await repos.toolCallLogs.getRecent(limit);
    return c.json({ logs });
  }),
);

// List all registered tools
app.get(
  "/",
  withErrorHandling("tools/list", async (c) => {
    const registry = getRegistry();
    const tools = registry.getAllTools().map((t) => ({
      id: t.id,
      appId: t.appId,
      source: t.source,
      name: t.name,
      title: t.title,
      description: t.description,
      risk: t.risk,
      permissions: t.permissions,
      requiresConfirmation: t.requiresConfirmation,
      inputSchema: t.inputSchema,
    }));

    // Derive bySource from the same tools array to guarantee consistency
    const bySource = {
      native: tools.filter((t) => t.source === "native").length,
      mcp: tools.filter((t) => t.source === "mcp").length,
      skill: tools.filter((t) => t.source === "skill").length,
      rest: tools.filter((t) => t.source === "rest").length,
    };
    const accounted = bySource.native + bySource.mcp + bySource.skill + bySource.rest;
    if (accounted !== tools.length) {
      console.warn(`[Tools] bySource sum (${accounted}) !== total (${tools.length}). Unaccounted tools may have unexpected source values.`);
    }

    return c.json({
      tools,
      count: tools.length,
      bySource,
    });
  }),
);

// Get a specific tool
app.get(
  "/:id",
  withErrorHandling("tools/get", async (c) => {
    const registry = getRegistry();
    const toolId = c.req.param("id")!;
    const tool = registry.resolveTool(toolId);

    if (!tool) {
      return apiError(c, `Tool not found: ${toolId}`, 404, ErrorCodes.NOT_FOUND);
    }

    return c.json({
      id: tool.id,
      appId: tool.appId,
      source: tool.source,
      name: tool.name,
      title: tool.title,
      description: tool.description,
      risk: tool.risk,
      permissions: tool.permissions,
      requiresConfirmation: tool.requiresConfirmation,
      inputSchema: tool.inputSchema,
    });
  }),
);

app.post(
  "/filter",
  withErrorHandling("tools/filter", async (c) => {
    const registry = getRegistry();
    const filter = await c.req.json<{
      appId?: string;
      source?: ToolSource;
      risk?: RiskLevel;
      search?: string;
    }>();

    const tools = registry.filterTools(filter).map((t) => ({
      id: t.id,
      appId: t.appId,
      source: t.source,
      name: t.name,
      title: t.title,
      description: t.description,
      risk: t.risk,
    }));

    return c.json({ tools, count: tools.length });
  }),
);

// Execute a tool (with permission guard)
app.post(
  "/:id/execute",
  withErrorHandling("tools/execute", async (c) => {
    const registry = getRegistry();
    const toolId = c.req.param("id")!;
    const args = await c.req.json<unknown>();

    const tool = registry.resolveTool(toolId);
    if (!tool) {
      return apiError(c, `Tool not found: ${toolId}`, 404, ErrorCodes.NOT_FOUND);
    }

    const executeResult = await toolRuntime.execute(toolId, args, { caller: "rest-api" });
    if (isApprovalRequiredResult(executeResult)) {
      return c.json({ error: "Approval required", approvalRequestId: executeResult.approvalRequestId }, 202);
    }
    return c.json(executeResult.result);
  }),
);

// List pending confirmations (for high-risk tools deferred by AI)
app.get(
  "/pending-confirmations",
  withErrorHandling("tools/pending-confirmations", async (c) => {
    const guard = toolRuntime.getPermissionGuard();
    return c.json({ confirmations: guard.getPendingConfirmations() });
  }),
);

// Resolve a pending confirmation (confirm or deny)
app.post(
  "/confirm/:id",
  withErrorHandling("tools/confirm", async (c) => {
    const confirmationId = c.req.param("id")!;
    const body = await c.req.json<{ approved?: boolean }>();
    const approved = body.approved ?? true;

    const guard = toolRuntime.getPermissionGuard();
    const resolved = guard.resolvePendingConfirmation(confirmationId, approved);

    if (!resolved) {
      return apiError(c, "Confirmation not found or already resolved", 404, ErrorCodes.NOT_FOUND);
    }

    return c.json({ success: true, confirmationId, approved });
  }),
);

export default app;
