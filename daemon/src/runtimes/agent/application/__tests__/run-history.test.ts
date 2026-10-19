import { describe, expect, it } from "vitest";
import { projectConversation } from "../run-history.js";
import type { AgentRunEvent } from "../../domain/agent-run.js";

function row(sequence: number, payload: AgentRunEvent) {
  return { sequence, type: payload.type, payload };
}

describe("projectConversation", () => {
  it("rebuilds turns from message boundary events", () => {
    const events = [
      row(0, { type: "run_started", runId: "r1", mode: "chat" }),
      row(1, { type: "user_message", messageId: "m1", content: "hello" }),
      row(2, { type: "memory_read", memoryIds: ["mem1"] }),
      row(3, { type: "assistant_message", messageId: "m2", content: "hi there" }),
    ];

    expect(projectConversation(events)).toEqual([
      { messageId: "m1", role: "user", content: "hello", sequence: 1 },
      { messageId: "m2", role: "assistant", content: "hi there", toolCalls: undefined, sequence: 3 },
    ]);
  });

  it("ignores execution detail that is not part of the conversation", () => {
    const events = [
      row(0, { type: "delta", text: "partial" }),
      row(1, { type: "tool_call", toolCall: { name: "read", args: {} } }),
      row(2, { type: "memory_read", memoryIds: [] }),
      row(3, { type: "run_completed", result: { text: "done", conversationId: "c1" } }),
    ];

    expect(projectConversation(events)).toEqual([]);
  });

  it("orders by sequence regardless of arrival order", () => {
    const events = [
      row(5, { type: "assistant_message", messageId: "m2", content: "answer" }),
      row(2, { type: "user_message", messageId: "m1", content: "question" }),
    ];

    expect(projectConversation(events).map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("survives events whose payload is not an AgentRunEvent", () => {
    const events = [
      { sequence: 0, type: "executor.started", payload: { type: "executor.started", runId: "x" } },
      row(1, { type: "user_message", messageId: "m1", content: "still here" }),
    ];

    expect(projectConversation(events).map((m) => m.content)).toEqual(["still here"]);
  });
});
