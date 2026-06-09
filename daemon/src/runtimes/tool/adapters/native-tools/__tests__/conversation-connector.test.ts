import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const conversationsRepo = {
  list: vi.fn(),
  getMessages: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
};

vi.mock("../../../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    conversations: conversationsRepo,
  }),
}));

import { registerConversationTools } from "../conversation.js";
import { getRegistry } from "../registry.js";

describe("Conversation Connector", () => {
  beforeAll(() => {
    registerConversationTools();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes conversations matching a query while excluding the current conversation by default", async () => {
    conversationsRepo.list.mockResolvedValue([
      { id: "current", title: "TICK: current processing" },
      { id: "tick-title", title: "TICK: autonomous processing" },
      { id: "content-match", title: "Normal chat" },
      { id: "unmatched", title: "Daily notes" },
    ]);
    conversationsRepo.getMessages.mockImplementation(async (conversationId: string) => {
      if (conversationId === "content-match") {
        return [{ content: "这里有一次心跳检查记录" }];
      }
      return [{ content: "ordinary content" }];
    });
    conversationsRepo.deleteMany.mockResolvedValue(2);

    const tool = getRegistry().resolveTool("deleteConversationsByQuery");
    const result = await tool!.execute({
      query: "心跳",
      currentConversationId: "current",
    });

    expect(result.success).toBe(true);
    expect(conversationsRepo.deleteMany).toHaveBeenCalledWith(["tick-title", "content-match"]);
  });

  it("deletes title matches for tick records", async () => {
    conversationsRepo.list.mockResolvedValue([
      { id: "tick-1", title: "TICK: autonomous processing" },
      { id: "other", title: "Normal chat" },
    ]);
    conversationsRepo.getMessages.mockResolvedValue([{ content: "ordinary content" }]);
    conversationsRepo.deleteMany.mockResolvedValue(1);

    const tool = getRegistry().resolveTool("deleteConversationsByQuery");
    const result = await tool!.execute({ query: "TICK" });

    expect(result.success).toBe(true);
    expect(conversationsRepo.deleteMany).toHaveBeenCalledWith(["tick-1"]);
  });
});
