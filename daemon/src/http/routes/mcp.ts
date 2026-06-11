import { Hono } from "hono";
import { getMCPManager, connectMCPServer, disconnectMCPServer } from "../../gateways/mcp/client.js";
import { addMCPServer, removeMCPServer } from "../../config/mcp-config.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import type { MCPServerConfig } from "@jarvis/types";

const app = new Hono();

const VIRTUAL_AUTO_PROFILE = {
  id: "auto",
  provider: "system",
  modelName: "auto",
  displayName: "Auto (智能路由)",
  capabilities: {
    text: true,
    streaming: true,
    toolCalling: true,
    vision: true,
    audioInput: true,
    tts: true,
    jsonMode: true,
    longContext: true,
  },
  limits: { contextWindow: 1000000, maxOutputTokens: 8192 },
  cost: { input: 0, output: 0 },
};


// List all MCP server connections
app.get("/servers", withErrorHandling("mcp/servers/list", async (c) => {
  const manager = getMCPManager();
  return c.json({
    servers: manager.getAllServerInfo(),
  });
}));

// Get a specific server's info
app.get("/servers/:id", withErrorHandling("mcp/servers/get", async (c) => {
  const manager = getMCPManager();
  const serverId = c.req.param("id")!;
  const info = manager.getServerInfo(serverId);
  if (!info) {
    return c.json({ error: "Server not found" }, 404);
  }
  return c.json(info);
}));

// Connect to a new MCP server
app.post("/servers", withErrorHandling("mcp/servers/connect", async (c) => {
  const body = await c.req.json<MCPServerConfig>();

  if (!body.id || !body.name || !body.transport) {
    return c.json({ error: "Missing required fields: id, name, transport" }, 400);
  }

  await connectMCPServer(body);
  addMCPServer(body);
  const manager = getMCPManager();
  const info = manager.getServerInfo(body.id);
  return c.json({ success: true, server: info });
}));

// Update an MCP server (disconnect old, reconnect with new config)
app.put("/servers/:id", withErrorHandling("mcp/servers/update", async (c) => {
  const serverId = c.req.param("id")!;
  const body = await c.req.json<MCPServerConfig>();

  try {
    await disconnectMCPServer(serverId);
    removeMCPServer(serverId);
  } catch {
    // Ignore disconnect errors — server may already be disconnected
  }

  const config = { ...body, id: serverId };
  await connectMCPServer(config);
  addMCPServer(config);
  const manager = getMCPManager();
  const info = manager.getServerInfo(serverId);
  return c.json({ success: true, server: info });
}));

// Disconnect from an MCP server
app.delete("/servers/:id", withErrorHandling("mcp/servers/disconnect", async (c) => {
  const serverId = c.req.param("id")!;
  await disconnectMCPServer(serverId);
  removeMCPServer(serverId);
  return c.json({ success: true });
}));

// List all tools from all connected servers
app.get("/tools", withErrorHandling("mcp/tools/list", async (c) => {
  const manager = getMCPManager();
  return c.json({
    tools: manager.getAllTools(),
    count: manager.getAllTools().length,
  });
}));

// List all resources from all connected servers
app.get("/resources", withErrorHandling("mcp/resources/list", async (c) => {
  const manager = getMCPManager();
  return c.json({
    resources: manager.getAllResources(),
    count: manager.getAllResources().length,
  });
}));

// List all prompts from all connected servers
app.get("/prompts", withErrorHandling("mcp/prompts/list", async (c) => {
  const manager = getMCPManager();
  return c.json({
    prompts: manager.getAllPrompts(),
    count: manager.getAllPrompts().length,
  });
}));

// Call a tool on a specific server
app.post("/servers/:id/tools/:toolName", withErrorHandling("mcp/tools/call", async (c) => {
  const serverId = c.req.param("id")!;
  const toolName = c.req.param("toolName")!;
  const args = await c.req.json<Record<string, unknown>>();

  const manager = getMCPManager();
  const result = await manager.callTool(serverId, toolName, args);
  return c.json(result);
}));

// Read a resource from a specific server
app.get("/servers/:id/resources/*", withErrorHandling("mcp/resources/read", async (c) => {
  const serverId = c.req.param("id")!;
  const uri = c.req.path.split("/resources/")[1];

  const manager = getMCPManager();
  const result = await manager.readResource(serverId, uri);
  return c.json(result);
}));

// Get model gateway info
app.get("/models", withErrorHandling("mcp/models", async (c) => {
  const { getModelGateway } = await import("../../gateways/model/gateway.js");
  const gateway = getModelGateway();
  return c.json({
    profiles: [VIRTUAL_AUTO_PROFILE, ...gateway.getAllProfiles()],
  });
}));

export default app;
