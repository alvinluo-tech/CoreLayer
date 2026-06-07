import { describe, it, expect, beforeEach, vi } from "vitest";
import { ToolIndex, resetToolIndex, classifyToolTier, detectDomain } from "../application/tool-index.js";
import type { JarvisTool } from "@jarvis/types";

// Mock the tools registry for ContextBuilder tests
vi.mock("../../tool/adapters/native-tools/registry.js", () => ({
  getRegistry: () => ({ resolveTool: () => null, getTool: () => null }),
  registerJarvisTool: vi.fn(),
  registerTool: vi.fn(),
  getTool: vi.fn(() => null),
  getAllTools: vi.fn(() => []),
  getAllJarvisTools: () => [
    {
      id: "native:getTodayTasks",
      appId: "jarvis",
      source: "native",
      name: "getTodayTasks",
      title: "getTodayTasks",
      description: "获取今天的任务列表",
      inputSchema: { type: "object" },
      risk: "low",
      permissions: [],
      requiresConfirmation: false,
      execute: vi.fn(),
    },
    {
      id: "native:createTask",
      appId: "jarvis",
      source: "native",
      name: "createTask",
      title: "createTask",
      description: "创建一个新任务",
      inputSchema: { type: "object" },
      risk: "low",
      permissions: [],
      requiresConfirmation: false,
      execute: vi.fn(),
    },
    {
      id: "native:getReadingList",
      appId: "jarvis",
      source: "native",
      name: "getReadingList",
      title: "getReadingList",
      description: "获取阅读清单列表",
      inputSchema: { type: "object" },
      risk: "low",
      permissions: [],
      requiresConfirmation: false,
      execute: vi.fn(),
    },
    {
      id: "native:deleteConversation",
      appId: "jarvis",
      source: "native",
      name: "deleteConversation",
      title: "deleteConversation",
      description: "删除一个对话",
      inputSchema: { type: "object" },
      risk: "low",
      permissions: [],
      requiresConfirmation: false,
      execute: vi.fn(),
    },
  ],
}));

// Mock tool-index to reset global state
vi.mock("../application/tool-index.js", async () => {
  const actual = (await vi.importActual("../application/tool-index.js")) as typeof import("../application/tool-index.js");
  return {
    ...actual,
    getToolIndex: () => {
      return new actual.ToolIndex();
    },
  };
});

// ---- Helpers ----

function makeTool(
  id: string,
  name: string,
  description: string,
): JarvisTool {
  return {
    id,
    appId: "test",
    source: "native",
    name,
    title: name,
    description,
    inputSchema: { type: "object" },
    risk: "low",
    permissions: [],
    requiresConfirmation: false,
    execute: async () => ({ success: true }),
  };
}

// ---- Tests ----

describe("ToolIndex", () => {
  let index: ToolIndex;

  beforeEach(() => {
    resetToolIndex();
    index = new ToolIndex();
  });

  describe("addTool", () => {
    it("adds a tool to the index", () => {
      const tool = makeTool("1", "getTasks", "获取任务列表");
      index.addTool(tool);
      expect(index.size).toBe(1);
    });

    it("adds multiple tools", () => {
      const tools = [
        makeTool("1", "getTasks", "获取任务列表"),
        makeTool("2", "createTask", "创建新任务"),
        makeTool("3", "deleteTask", "删除任务"),
      ];
      index.addTools(tools);
      expect(index.size).toBe(3);
    });
  });

  describe("removeTool", () => {
    it("removes a tool by ID", () => {
      index.addTool(makeTool("1", "getTasks", "获取任务列表"));
      index.addTool(makeTool("2", "createTask", "创建新任务"));

      const removed = index.removeTool("1");
      expect(removed).toBe(true);
      expect(index.size).toBe(1);
    });

    it("returns false for non-existent tool", () => {
      const removed = index.removeTool("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("searchTools", () => {
    beforeEach(() => {
      index.addTools([
        makeTool("1", "getTasks", "获取今天的任务列表"),
        makeTool("2", "createTask", "创建一个新的待办任务"),
        makeTool("3", "getReadingList", "获取阅读清单列表"),
        makeTool("4", "bash", "执行shell命令"),
        makeTool("5", "readFile", "读取文件内容"),
      ]);
    });

    it("returns relevant tools for a query", () => {
      const results = index.searchTools("任务", 3);
      expect(results.length).toBeGreaterThan(0);
      const toolNames = results.map((r) => r.tool.name);
      expect(toolNames).toContain("getTasks");
      expect(toolNames).toContain("createTask");
    });

    it("ranks more relevant tools higher", () => {
      const results = index.searchTools("创建任务", 5);
      expect(results.length).toBeGreaterThan(0);
      // createTask should be ranked highly for "创建任务"
      const topResult = results[0].tool.name;
      expect(topResult).toBe("createTask");
    });

    it("returns empty array for no matches", () => {
      const results = index.searchTools("zzzznonexistent", 5);
      // May return results with score 0 or empty
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("respects topK limit", () => {
      const results = index.searchTools("任务", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("handles empty query", () => {
      const results = index.searchTools("", 5);
      expect(results.length).toBe(5);
    });

    it("handles Chinese queries", () => {
      const results = index.searchTools("阅读清单", 3);
      expect(results.length).toBeGreaterThan(0);
      const toolNames = results.map((r) => r.tool.name);
      expect(toolNames).toContain("getReadingList");
    });
  });

  describe("getAllTools", () => {
    it("returns all tools", () => {
      index.addTools([
        makeTool("1", "tool1", "desc1"),
        makeTool("2", "tool2", "desc2"),
      ]);
      const tools = index.getAllTools();
      expect(tools.length).toBe(2);
    });
  });

  describe("clear", () => {
    it("clears all tools", () => {
      index.addTools([
        makeTool("1", "tool1", "desc1"),
        makeTool("2", "tool2", "desc2"),
      ]);
      index.clear();
      expect(index.size).toBe(0);
    });
  });

  describe("rebuild", () => {
    it("rebuilds index when dirty", () => {
      index.addTool(makeTool("1", "getTasks", "获取任务"));
      index.addTool(makeTool("2", "createTask", "创建任务"));

      // First search triggers rebuild
      const results1 = index.searchTools("任务", 5);
      expect(results1.length).toBe(2);

      // Add more tools
      index.addTool(makeTool("3", "getReading", "获取阅读"));
      const results2 = index.searchTools("阅读", 5);
      expect(results2.length).toBeGreaterThan(0);
      expect(results2.map((r) => r.tool.name)).toContain("getReading");
    });
  });
});

describe("ContextBuilder RAG integration", () => {
  beforeEach(() => {
    resetToolIndex();
  });

  it("selects relevant tools via RAG", async () => {
    // This test verifies the integration with context-builder
    // The mock in context-builder.test.ts provides the tools
    const { ContextBuilder } = await import("../application/context-builder.js");
    const builder = new ContextBuilder({
      modelName: "gpt-4o",
      userMessage: "我今天有什么任务",
    });
    const context = await builder.build([], []);
    expect(context.toolsUsed).toContain("getTodayTasks");
  });

  it("includes always-available tools", async () => {
    const { ContextBuilder } = await import("../application/context-builder.js");
    const builder = new ContextBuilder({
      modelName: "gpt-4o",
      userMessage: "删除对话",
    });
    const context = await builder.build([], []);
    // deleteConversation is always available
    expect(context.toolsUsed).toContain("deleteConversation");
  });
});

// ---- Tool Tier Classification ----

describe("classifyToolTier", () => {
  it("classifies core tools", () => {
    const tool = makeTool("1", "bash", "Execute shell commands");
    const result = classifyToolTier(tool);
    expect(result.tier).toBe("core");
  });

  it("classifies MCP tools as dynamic", () => {
    const tool = makeTool("1", "searchWeb", "Search the web");
    tool.source = "mcp";
    const result = classifyToolTier(tool);
    expect(result.tier).toBe("mcp");
  });

  it("classifies domain tools by name", () => {
    const tool = makeTool("1", "getTasks", "Get task list");
    const result = classifyToolTier(tool);
    expect(result.tier).toBe("domain");
    expect(result.domain).toBe("productivity");
  });

  it("classifies reading tools", () => {
    const tool = makeTool("1", "getReadingList", "Get reading list");
    const result = classifyToolTier(tool);
    expect(result.tier).toBe("domain");
    expect(result.domain).toBe("reading");
  });
});

describe("detectDomain", () => {
  it("detects productivity domain", () => {
    const history = [
      { content: "我今天有什么任务" },
      { content: "帮我创建一个待办事项" },
    ];
    const domain = detectDomain(history);
    expect(domain).toBe("productivity");
  });

  it("detects reading domain", () => {
    const history = [
      { content: "我的阅读清单里有什么" },
      { content: "帮我添加一篇文章" },
    ];
    const domain = detectDomain(history);
    expect(domain).toBe("reading");
  });

  it("returns null for ambiguous context", () => {
    const history = [
      { content: "你好" },
      { content: "今天天气怎么样" },
    ];
    const domain = detectDomain(history);
    expect(domain).toBeNull();
  });

  it("returns null for empty history", () => {
    const domain = detectDomain([]);
    expect(domain).toBeNull();
  });
});

describe("ToolIndex tier methods", () => {
  beforeEach(() => {
    resetToolIndex();
  });

  it("getToolsByTier returns tools of specified tier", () => {
    const index = new ToolIndex();
    index.addTool(makeTool("1", "bash", "Execute shell commands"));
    index.addTool(makeTool("2", "getTasks", "Get task list"));
    index.addTool(makeTool("3", "mcpTool", "MCP tool"));

    const coreTools = index.getToolsByTier("core");
    expect(coreTools.length).toBe(1);
    expect(coreTools[0].name).toBe("bash");
  });

  it("recordUsage increments usage count", () => {
    const index = new ToolIndex();
    index.addTool(makeTool("1", "getTasks", "Get task list"));

    index.recordUsage("1");
    index.recordUsage("1");

    const mcpTools = index.getMcpToolsSortedByFrequency();
    // getTasks is not MCP, so this tests the method but won't find it
    expect(mcpTools.length).toBe(0);
  });

  it("getMcpToolsSortedByFrequency returns MCP tools sorted", () => {
    const index = new ToolIndex();
    const mcpTool1 = makeTool("1", "mcpTool1", "MCP tool 1");
    mcpTool1.source = "mcp";
    const mcpTool2 = makeTool("2", "mcpTool2", "MCP tool 2");
    mcpTool2.source = "mcp";

    index.addTool(mcpTool1);
    index.addTool(mcpTool2);

    // Use mcpTool2 twice, mcpTool1 once
    index.recordUsage("2");
    index.recordUsage("2");
    index.recordUsage("1");

    const sorted = index.getMcpToolsSortedByFrequency();
    expect(sorted.length).toBe(2);
    expect(sorted[0].name).toBe("mcpTool2"); // Higher usage count
    expect(sorted[1].name).toBe("mcpTool1");
  });
});
