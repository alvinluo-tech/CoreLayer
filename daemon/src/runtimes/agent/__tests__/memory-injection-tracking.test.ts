import { describe, it, expect, vi } from "vitest";
import { ContextBuilder } from "../application/context-builder.js";
import type { ScoredMemoryRow } from "../../../persistence/repository.js";

vi.mock("../../../config/config-manager.js", () => ({
  configManager: {
    getMemoryMinScore: () => 0.3,
  },
}));

vi.mock("../../tool/public-api.js", () => ({
  getAllTools: () => [],
  getAllJarvisTools: () => [],
  getDynamicToolRouter: () => ({ routeTools: (opts: { allTools: unknown }) => opts.allTools }),
}));

describe("ContextBuilder Memory Injection & Snapshots", () => {
  const mockMemories: ScoredMemoryRow[] = [
    {
      id: "mem-pin-1",
      userId: "user-1",
      key: "preferred_db",
      value: "sqlite",
      tier: "pinned",
      type: "preference",
      score: 1.0,
      confidence: 1.0,
      scopeType: "user",
      scopeId: null,
      uses: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastInjectedAt: null,
      source: null,
      sourceRunId: null,
      sourceMessageId: null,
      lastVerifiedAt: null,
      expiresAt: null,
    },
    {
      id: "mem-fact-2",
      userId: "user-1",
      key: "framework",
      value: "react",
      tier: "fact",
      type: "fact",
      score: 0.8,
      confidence: 0.9,
      scopeType: "user",
      scopeId: null,
      uses: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastInjectedAt: null,
      source: null,
      sourceRunId: null,
      sourceMessageId: null,
      lastVerifiedAt: null,
      expiresAt: null,
    },
    {
      id: "mem-low-3",
      userId: "user-1",
      key: "random_noise",
      value: "ignored",
      tier: "fact",
      type: "fact",
      score: 0.1, // below minScore 0.3 -> filtered out
      confidence: 0.5,
      scopeType: "user",
      scopeId: null,
      uses: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastInjectedAt: null,
      source: null,
      sourceRunId: null,
      sourceMessageId: null,
      lastVerifiedAt: null,
      expiresAt: null,
    },
  ];

  it("extracts and exposes injectedMemoryIds for filtered top memories", async () => {
    const builder = new ContextBuilder({
      mode: "text",
      modelName: "deepseek-coder",
      userMessage: "build app",
    });

    const context = await builder.build(mockMemories, []);

    // Only mem-pin-1 and mem-fact-2 survive filtering
    expect(context.injectedMemoryIds).toHaveLength(2);
    expect(context.injectedMemoryIds).toContain("mem-pin-1");
    expect(context.injectedMemoryIds).toContain("mem-fact-2");
    expect(context.injectedMemoryIds).not.toContain("mem-low-3");
  });

  it("injects userProfile and memorySnapshot into system prompt", async () => {
    const builder = new ContextBuilder({
      mode: "text",
      modelName: "deepseek-coder",
      userProfile: "- Experienced Rust & TypeScript dev",
      memorySnapshot: "- Never use ANY in TypeScript",
    });

    const context = await builder.build([], []);
    const systemContent = context.messages[0].content as string;

    expect(systemContent).toContain("## 用户画像");
    expect(systemContent).toContain("- Experienced Rust & TypeScript dev");
    expect(systemContent).toContain("## 长期记忆快照");
    expect(systemContent).toContain("- Never use ANY in TypeScript");
  });

  it("returns empty injectedMemoryIds on systemPromptOverride fast path", async () => {
    const builder = new ContextBuilder({
      mode: "text",
      modelName: "deepseek-coder",
      systemPromptOverride: "Overridden prompt",
    });

    const context = await builder.build(mockMemories, []);
    expect(context.injectedMemoryIds).toEqual([]);
    expect(context.messages[0].content).toBe("Overridden prompt");
  });
});
