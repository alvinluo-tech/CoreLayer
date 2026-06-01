import { Hono } from "hono";
import type { ToolSource, RiskLevel } from "@jarvis/types";
import { getRegistry } from "../tools/registry.js";
import { getRepositories } from "../db/factory.js";
import { toolRuntime } from "../runtime/index.js";

const app = new Hono();

// Get recent tool call audit logs
app.get("/logs", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    const repos = getRepositories();
    const logs = await repos.toolCallLogs.getRecent(limit);
    return c.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

// List all registered tools
app.get("/", (c) => {
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
});

// Get a specific tool
app.get("/:id", (c) => {
  const registry = getRegistry();
  const toolId = c.req.param("id");
  const tool = registry.getTool(toolId);

  if (!tool) {
    return c.json({ error: "Tool not found" }, 404);
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
});

// Filter tools
app.post("/filter", async (c) => {
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

// Execute a tool (with permission guard)
app.post("/:id/execute", async (c) => {
  const registry = getRegistry();
  const toolId = c.req.param("id");
  const args = await c.req.json<unknown>();

  const tool = registry.getTool(toolId);
  if (!tool) {
    return c.json({ error: "Tool not found" }, 404);
  }

  try {
    const { result } = await toolRuntime.execute(toolId, args, { caller: "rest-api" });
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: "Tool execution failed",
    }, 500);
  }
});

// List pending confirmations (for high-risk tools deferred by AI)
app.get("/pending-confirmations", (c) => {
  const guard = toolRuntime.getPermissionGuard();
  return c.json({ confirmations: guard.getPendingConfirmations() });
});

// Resolve a pending confirmation (confirm or deny)
app.post("/confirm/:id", async (c) => {
  const confirmationId = c.req.param("id");
  const body = await c.req.json<{ approved?: boolean }>();
  const approved = body.approved ?? true;

  const guard = toolRuntime.getPermissionGuard();
  const resolved = guard.resolvePendingConfirmation(confirmationId, approved);

  if (!resolved) {
    return c.json({ error: "Confirmation not found or already resolved" }, 404);
  }

  return c.json({ success: true, confirmationId, approved });
});

export default app;
