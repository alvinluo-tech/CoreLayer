import { describe, it, expect, vi } from "vitest";
import { ContextBuilder } from "./context-builder.js";
import type { MessageRow, ScoredMemoryRow } from "../db/repository.js";

// Mock the tools registry
vi.mock("../tools/registry.js", () => ({
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

// ---- Helpers ----

function makeMemory(
  key: string,
  value: string,
  type: string = "fact",
  score: number = 1.0,
  tier?: string,
): ScoredMemoryRow {
  return {
    id: `mem-${key}`,
    userId: "default",
    key,
    value,
    type: type as ScoredMemoryRow["type"],
    tier: (tier ?? (type === "preference" ? "preference" : type === "fact" ? "fact" : "context")) as ScoredMemoryRow["tier"],
    source: null,
    confidence: 1.0,
    uses: 0,
    expiresAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    score,
  };
}

function makeMessage(
  role: "user" | "assistant",
  content: string,
  id: string = `msg-${Math.random()}`,
): MessageRow {
  return {
    id,
    conversationId: "conv-1",
    role,
    content,
    toolCalls: null,
    toolCallId: null,
    parentMessageId: null,
    tokenCount: null,
    compressed: false,
    createdAt: "2026-01-01",
  };
}

// ---- Tests ----

describe("ContextBuilder", () => {
  describe("basic construction", () => {
    it("builds a context with system message", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      expect(context.messages.length).toBeGreaterThanOrEqual(1);
      expect(context.messages[0].role).toBe("system");
      expect(typeof context.messages[0].content).toBe("string");
    });

    it("includes conversation history in messages", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const history = [
        makeMessage("user", "你好"),
        makeMessage("assistant", "你好！有什么可以帮你的？"),
      ];
      const context = await builder.build([], history);
      // system + 2 history messages
      expect(context.messages.length).toBe(3);
      expect(context.messages[1].role).toBe("user");
      expect(context.messages[2].role).toBe("assistant");
    });
  });

  describe("mode variants", () => {
    it("includes voice persona when mode is voice", async () => {
      const builder = new ContextBuilder({
        mode: "voice",
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("语音对话");
      expect(systemMsg).toContain("口语化");
    });

    it("voice persona includes ASR noise handling instructions", async () => {
      const builder = new ContextBuilder({
        mode: "voice",
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("ASR");
      expect(systemMsg).toContain("噪音");
    });

    it("voice persona includes 200 char hard limit", async () => {
      const builder = new ContextBuilder({
        mode: "voice",
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("200");
    });

    it("voice persona includes single character handling", async () => {
      const builder = new ContextBuilder({
        mode: "voice",
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("单字符");
    });

    it("includes text persona when mode is text", async () => {
      const builder = new ContextBuilder({
        mode: "text",
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("Markdown");
    });
  });

  describe("dynamic tool selection", () => {
    it("selects relevant tools based on user message", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
        userMessage: "我今天有什么任务",
      });
      const context = await builder.build([], []);
      expect(context.toolsUsed).toContain("getTodayTasks");
    });

    it("includes all tools when no user message", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      expect(context.toolsUsed.length).toBeGreaterThan(0);
    });

    it("respects MAX_TOOLS limit", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
        userMessage: "任务",
      });
      const context = await builder.build([], []);
      expect(context.toolsUsed.length).toBeLessThanOrEqual(16);
    });
  });

  describe("memory injection", () => {
    it("injects memories into system prompt", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const memories = [
        makeMemory("favorite_color", "蓝色", "preference", 2.0),
        makeMemory("pet_name", "小黑", "fact", 1.0),
      ];
      const context = await builder.build(memories, []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("用户记忆");
      expect(systemMsg).toContain("favorite_color");
      expect(systemMsg).toContain("蓝色");
    });

    it("limits memories to MAX_MEMORIES", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const memories = Array.from({ length: 20 }, (_, i) =>
        makeMemory(`key${i}`, `value${i}`, "fact", 20 - i),
      );
      const debug = await builder.build(memories, []);
      const debugInfo = debug.debug();
      expect(debugInfo.memories.selected).toBeLessThanOrEqual(15);
    });

    it("handles empty memories gracefully", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      expect(context.messages.length).toBeGreaterThanOrEqual(1);
    });

    it("always injects preference memories regardless of score", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      // Preference with very low score should still be injected
      const memories = [
        makeMemory("low_pref", "低分偏好", "preference", 0.01, "preference"),
      ];
      const context = await builder.build(memories, []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("low_pref");
    });

    it("applies score threshold to context and fact memories", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const memories = [
        makeMemory("high_ctx", "高分上下文", "context", 2.0, "context"),
        makeMemory("low_ctx", "低分上下文", "context", 0.1, "context"),
        makeMemory("high_fact", "高分事实", "fact", 2.0, "fact"),
        makeMemory("low_fact", "低分事实", "fact", 0.1, "fact"),
      ];
      const context = await builder.build(memories, []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("high_ctx");
      expect(systemMsg).toContain("high_fact");
      expect(systemMsg).not.toContain("low_ctx");
      expect(systemMsg).not.toContain("low_fact");
    });
  });

  describe("summary injection", () => {
    it("injects summary when provided", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      }).withSummary("用户正在开发一个 AI 助手项目。已完成任务管理模块。");
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("对话摘要");
      expect(systemMsg).toContain("AI 助手项目");
    });

    it("does not include summary section when not provided", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).not.toContain("对话摘要");
    });
  });

  describe("token tracking", () => {
    it("reports token usage", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      expect(context.tokens.system).toBeGreaterThan(0);
      expect(context.tokens.budget).toBeGreaterThan(0);
      expect(context.tokens.total).toBeGreaterThan(0);
    });

    it("total tokens does not exceed budget", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const history = Array.from({ length: 50 }, (_, i) =>
        makeMessage(i % 2 === 0 ? "user" : "assistant", `消息 ${i}: ${"x".repeat(100)}`),
      );
      const context = await builder.build([], history);
      // History may be truncated but total should be reasonable
      expect(context.tokens.total).toBeLessThanOrEqual(context.tokens.budget * 1.1);
    });
  });

  describe("debug output", () => {
    it("returns complete debug info", async () => {
      const builder = new ContextBuilder({
        mode: "text",
        modelName: "gpt-4o",
        conversationId: "conv-123",
        userMessage: "查看任务",
      });
      const memories = [makeMemory("color", "蓝色", "preference", 1.5)];
      const context = await builder.build(memories, []);
      const debugInfo = context.debug();

      expect(debugInfo.mode).toBe("text");
      expect(debugInfo.modelName).toBe("gpt-4o");
      expect(debugInfo.sections.length).toBeGreaterThan(0);
      expect(debugInfo.tools.total).toBeGreaterThanOrEqual(0);
      expect(debugInfo.tools.selected).toBeGreaterThan(0);
      expect(debugInfo.memories.total).toBe(1);
      expect(debugInfo.memories.selected).toBe(1);
      expect(debugInfo.summaryInjected).toBe(false);
      expect(debugInfo.tokens.system).toBeGreaterThan(0);
    });

    it("reports summaryInjected as true when summary provided", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      }).withSummary("之前的对话摘要内容");
      const context = await builder.build([], []);
      const debugInfo = context.debug();
      expect(debugInfo.summaryInjected).toBe(true);
    });

    it("includes section details", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const debugInfo = context.debug();
      const sectionNames = debugInfo.sections.map((s) => s.name);
      expect(sectionNames).toContain("persona");
      expect(sectionNames).toContain("tools");
      expect(sectionNames).toContain("date");
    });

    it("places conversation-summary after tools, before memory", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      }).withSummary("test summary");
      const context = await builder.build([], []);
      const debugInfo = context.debug();
      const sectionNames = debugInfo.sections.map((s) => s.name);
      const toolsIdx = sectionNames.indexOf("tools");
      const summaryIdx = sectionNames.indexOf("conversation-summary");
      const memoryIdx = sectionNames.indexOf("memory");
      expect(summaryIdx).toBeGreaterThan(toolsIdx);
      expect(summaryIdx).toBeLessThan(memoryIdx);
    });
  });

  describe("conversation info", () => {
    it("includes conversationId in system prompt", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
        conversationId: "conv-abc",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("conv-abc");
    });

    it("handles missing conversationId", async () => {
      const builder = new ContextBuilder({
        modelName: "gpt-4o",
      });
      const context = await builder.build([], []);
      const systemMsg = context.messages[0].content as string;
      expect(systemMsg).toContain("未知");
    });
  });
});
