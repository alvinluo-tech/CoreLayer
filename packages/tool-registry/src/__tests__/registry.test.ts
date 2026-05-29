import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../registry.js";
import type { JarvisTool } from "@jarvis/types";

function createTestTool(overrides: Partial<JarvisTool> = {}): JarvisTool {
  return {
    id: "test:tool1",
    appId: "test-app",
    source: "native",
    name: "testTool",
    title: "Test Tool",
    description: "A test tool",
    inputSchema: { type: "object" },
    risk: "low",
    permissions: [],
    requiresConfirmation: false,
    execute: async () => ({ success: true, data: "ok" }),
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves a tool", () => {
    const registry = new ToolRegistry();
    const tool = createTestTool();
    registry.registerTool(tool);

    expect(registry.getTool("test:tool1")).toBe(tool);
    expect(registry.size).toBe(1);
  });

  it("registers multiple tools", () => {
    const registry = new ToolRegistry();
    const tools = [
      createTestTool({ id: "t1", name: "tool1" }),
      createTestTool({ id: "t2", name: "tool2" }),
    ];
    registry.registerTools(tools);

    expect(registry.size).toBe(2);
    expect(registry.getToolNames()).toEqual(["t1", "t2"]);
  });

  it("unregisters a tool", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool());

    expect(registry.unregisterTool("test:tool1")).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.unregisterTool("nonexistent")).toBe(false);
  });

  it("unregisters by source", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "n1", source: "native" }));
    registry.registerTool(createTestTool({ id: "m1", source: "mcp" }));
    registry.registerTool(createTestTool({ id: "n2", source: "native" }));

    const removed = registry.unregisterBySource("native");
    expect(removed).toBe(2);
    expect(registry.size).toBe(1);
    expect(registry.getTool("m1")).toBeDefined();
  });

  it("filters tools by appId", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "a1", appId: "app1" }));
    registry.registerTool(createTestTool({ id: "a2", appId: "app2" }));
    registry.registerTool(createTestTool({ id: "a3", appId: "app1" }));

    const filtered = registry.filterTools({ appId: "app1" });
    expect(filtered).toHaveLength(2);
  });

  it("filters tools by source", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "n1", source: "native" }));
    registry.registerTool(createTestTool({ id: "m1", source: "mcp" }));

    const filtered = registry.filterTools({ source: "mcp" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("m1");
  });

  it("filters tools by risk level", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "low", risk: "low" }));
    registry.registerTool(createTestTool({ id: "high", risk: "high" }));

    const filtered = registry.filterTools({ risk: "high" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("high");
  });

  it("filters tools by search query", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "t1", name: "createTask", title: "Create Task" }));
    registry.registerTool(createTestTool({ id: "t2", name: "deleteTask", title: "Delete Task" }));
    registry.registerTool(createTestTool({ id: "t3", name: "readArticle", title: "Read Article" }));

    const filtered = registry.filterTools({ search: "task" });
    expect(filtered).toHaveLength(2);
  });

  it("filters tools by category", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "t1", category: "productivity" }));
    registry.registerTool(createTestTool({ id: "t2", category: "system" }));
    registry.registerTool(createTestTool({ id: "t3", category: "productivity" }));
    registry.registerTool(createTestTool({ id: "t4" })); // undefined category

    const filtered = registry.filterTools({ category: "productivity" });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe("t1");
    expect(filtered[1].id).toBe("t3");
  });

  it("filters tools by multiple criteria", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "t1", source: "mcp", category: "data" }));
    registry.registerTool(createTestTool({ id: "t2", source: "mcp", category: "system" }));
    registry.registerTool(createTestTool({ id: "t3", source: "native", category: "data" }));

    const filtered = registry.filterTools({ source: "mcp", category: "data" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("t1");
  });

  it("creates JarvisTools from MCP tool definitions", () => {
    const callTool = async () => ({
      content: [{ type: "text" as const, text: "result" }],
    });

    const tools = ToolRegistry.fromMCPTools(
      "server1",
      [
        { name: "tool1", description: "First tool" },
        { name: "tool2", description: "Second tool" },
      ],
      callTool,
    );

    expect(tools).toHaveLength(2);
    expect(tools[0].id).toBe("mcp:server1:tool1");
    expect(tools[0].source).toBe("mcp");
    expect(tools[0].appId).toBe("server1");
    expect(tools[0].description).toBe("First tool");
  });

  it("sets default metadata on MCP tools", () => {
    const callTool = async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    });

    const tools = ToolRegistry.fromMCPTools("srv", [{ name: "t1" }], callTool);
    const tool = tools[0];

    expect(tool.timeoutMs).toBe(30000);
    expect(tool.idempotent).toBe(false);
    expect(tool.cancellable).toBe(false);
    expect(tool.category).toBe("other");
    expect(tool.displayMode).toBe("card");
  });

  it("clears all tools", () => {
    const registry = new ToolRegistry();
    registry.registerTool(createTestTool({ id: "t1" }));
    registry.registerTool(createTestTool({ id: "t2" }));

    registry.clear();
    expect(registry.size).toBe(0);
  });
});
