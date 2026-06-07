import { Hono } from "hono";
import { getMCPManager, connectMCPServer, disconnectMCPServer } from "../../gateways/mcp/client.js";
import { addMCPServer, removeMCPServer } from "../../config/mcp-config.js";
import type { MCPServerConfig } from "@jarvis/types";

const app = new Hono();

// List all MCP server connections
app.get("/servers", (c) => {
  const manager = getMCPManager();
  return c.json({
    servers: manager.getAllServerInfo(),
  });
});

// Get a specific server's info
app.get("/servers/:id", (c) => {
  const manager = getMCPManager();
  const serverId = c.req.param("id");
  const info = manager.getServerInfo(serverId);
  if (!info) {
    return c.json({ error: "Server not found" }, 404);
  }
  return c.json(info);
});

// Connect to a new MCP server
app.post("/servers", async (c) => {
  const body = await c.req.json<MCPServerConfig>();

  if (!body.id || !body.name || !body.transport) {
    return c.json({ error: "Missing required fields: id, name, transport" }, 400);
  }

  try {
    await connectMCPServer(body);
    addMCPServer(body);
    const manager = getMCPManager();
    const info = manager.getServerInfo(body.id);
    return c.json({ success: true, server: info });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// Update an MCP server (disconnect old, reconnect with new config)
app.put("/servers/:id", async (c) => {
  const serverId = c.req.param("id");
  const body = await c.req.json<MCPServerConfig>();

  try {
    await disconnectMCPServer(serverId);
    removeMCPServer(serverId);
  } catch {
    // Ignore disconnect errors — server may already be disconnected
  }

  try {
    const config = { ...body, id: serverId };
    await connectMCPServer(config);
    addMCPServer(config);
    const manager = getMCPManager();
    const info = manager.getServerInfo(serverId);
    return c.json({ success: true, server: info });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// Disconnect from an MCP server
app.delete("/servers/:id", async (c) => {
  const serverId = c.req.param("id");
  try {
    await disconnectMCPServer(serverId);
    removeMCPServer(serverId);
    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// List all tools from all connected servers
app.get("/tools", (c) => {
  const manager = getMCPManager();
  return c.json({
    tools: manager.getAllTools(),
    count: manager.getAllTools().length,
  });
});

// List all resources from all connected servers
app.get("/resources", (c) => {
  const manager = getMCPManager();
  return c.json({
    resources: manager.getAllResources(),
    count: manager.getAllResources().length,
  });
});

// List all prompts from all connected servers
app.get("/prompts", (c) => {
  const manager = getMCPManager();
  return c.json({
    prompts: manager.getAllPrompts(),
    count: manager.getAllPrompts().length,
  });
});

// Call a tool on a specific server
app.post("/servers/:id/tools/:toolName", async (c) => {
  const serverId = c.req.param("id");
  const toolName = c.req.param("toolName");
  const args = await c.req.json<Record<string, unknown>>();

  const manager = getMCPManager();
  try {
    const result = await manager.callTool(serverId, toolName, args);
    return c.json(result);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// Read a resource from a specific server
app.get("/servers/:id/resources/*", async (c) => {
  const serverId = c.req.param("id");
  const uri = c.req.path.split("/resources/")[1];

  const manager = getMCPManager();
  try {
    const result = await manager.readResource(serverId, uri);
    return c.json(result);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// Get model gateway info
app.get("/models", async (c) => {
  try {
    const { getModelGateway } = await import("../../gateways/model/gateway.js");
    const gateway = getModelGateway();
    return c.json({
      profiles: gateway.getAllProfiles(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

export default app;
