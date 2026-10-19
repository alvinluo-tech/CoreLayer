import { describe, it, expect } from "vitest";
import {
  createToolCallTracker,
  flushOpenToolCalls,
  mapAcpUpdate,
  type AcpSessionUpdate,
} from "../event-mapper.js";

describe("mapAcpUpdate", () => {
  it("maps an assistant text chunk to an agent message", () => {
    const tracker = createToolCallTracker();
    const update: AcpSessionUpdate = {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello" },
    };

    const mapping = mapAcpUpdate(update, tracker);

    expect(mapping.events).toEqual([{ type: "agent_message", text: "Hello" }]);
    expect(mapping.agentText).toBe("Hello");
  });

  it("ignores empty text chunks", () => {
    const tracker = createToolCallTracker();
    const mapping = mapAcpUpdate(
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "" } },
      tracker,
    );
    expect(mapping.events).toEqual([]);
    expect(mapping.agentText).toBeUndefined();
  });

  it("drops reasoning chunks instead of mixing them into the transcript", () => {
    const tracker = createToolCallTracker();
    const mapping = mapAcpUpdate(
      { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } },
      tracker,
    );
    expect(mapping.events).toEqual([]);
  });

  it("maps a new tool call and remembers it for later updates", () => {
    const tracker = createToolCallTracker();
    const mapping = mapAcpUpdate(
      {
        sessionUpdate: "tool_call",
        toolCallId: "call-1",
        kind: "execute",
        status: "pending",
        title: "Terminal",
        rawInput: { command: "echo hi" },
      },
      tracker,
    );

    expect(mapping.events).toEqual([
      { type: "tool_call", toolName: "echo hi", input: { command: "echo hi" } },
    ]);
    expect(tracker.open.get("call-1")?.toolName).toBe("echo hi");
  });

  it("resolves the tool name from file_path when no tool name is given", () => {
    const tracker = createToolCallTracker();
    const mapping = mapAcpUpdate(
      {
        sessionUpdate: "tool_call",
        toolCallId: "call-2",
        kind: "edit",
        title: "Write file",
        rawInput: { file_path: "src/a.ts" },
      },
      tracker,
    );

    expect(mapping.events[0]).toEqual({
      type: "tool_call",
      toolName: "edit:src/a.ts",
      input: { file_path: "src/a.ts" },
    });
  });

  it("closes a tool call on a terminal status and reports the original name", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate(
      {
        sessionUpdate: "tool_call",
        toolCallId: "call-3",
        kind: "execute",
        title: "Terminal",
        rawInput: { command: "npm test" },
      },
      tracker,
    );

    const mapping = mapAcpUpdate(
      { sessionUpdate: "tool_call_update", toolCallId: "call-3", status: "completed", rawOutput: { exit: 0 } },
      tracker,
    );

    expect(mapping.events).toEqual([
      { type: "tool_result", toolName: "npm test", result: { status: "completed", output: { exit: 0 } } },
    ]);
    expect(mapping.closedToolCall).toEqual({ toolCallId: "call-3", toolName: "npm test", status: "completed" });
    expect(tracker.open.has("call-3")).toBe(false);
  });

  it("treats failed and cancelled statuses as terminal", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate({ sessionUpdate: "tool_call", toolCallId: "c", kind: "edit", title: "Edit" }, tracker);

    for (const status of ["failed", "cancelled"]) {
      const mapping = mapAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "c", status }, tracker);
      expect(mapping.closedToolCall?.status).toBe(status);
    }
  });

  it("does not announce the same tool call twice when ACP refines it", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate(
      { sessionUpdate: "tool_call", toolCallId: "c4", kind: "edit", title: "Preparing file…" },
      tracker,
    );

    const mapping = mapAcpUpdate(
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "c4",
        title: "Write PROOF.md",
        rawInput: { file_path: "PROOF.md" },
      },
      tracker,
    );

    // A refined update must not render a second card for the same tool call.
    expect(mapping.events).toEqual([]);
  });

  it("adopts a refined title so the result names the real operation", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate(
      { sessionUpdate: "tool_call", toolCallId: "c5", kind: "edit", title: "Preparing file…" },
      tracker,
    );

    mapAcpUpdate(
      { sessionUpdate: "tool_call_update", toolCallId: "c5", title: "Write PROOF.md" },
      tracker,
    );
    const closed = mapAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "c5", status: "completed" }, tracker);

    expect(closed.events).toEqual([
      { type: "tool_result", toolName: "Write PROOF.md", result: { status: "completed", output: null } },
    ]);
  });

  it("prefers the concrete input over a refined title once one is known", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate(
      { sessionUpdate: "tool_call", toolCallId: "c6", kind: "edit", title: "Preparing file…", rawInput: { file_path: "PROOF.md" } },
      tracker,
    );
    mapAcpUpdate(
      { sessionUpdate: "tool_call_update", toolCallId: "c6", title: "Write PROOF.md" },
      tracker,
    );
    const closed = mapAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "c6", status: "completed" }, tracker);

    // `edit:PROOF.md` says what is touched; the title is model prose.
    expect(closed.events[0]).toMatchObject({ toolName: "edit:PROOF.md" });
  });

  it("replaces a never-refined progress placeholder with the tool kind", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate(
      { sessionUpdate: "tool_call", toolCallId: "c7", kind: "edit", title: "Preparing file…" },
      tracker,
    );
    const closed = mapAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "c7", status: "completed" }, tracker);

    // "Preparing file…" names no operation; "edit" at least names the effect.
    expect(closed.events[0]).toMatchObject({ toolName: "edit" });
  });

  it("keeps a real tool name as-is", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate({ sessionUpdate: "tool_call", toolCallId: "c8", kind: "execute", title: "Terminal" }, tracker);
    const closed = mapAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "c8", status: "completed" }, tracker);
    expect(closed.events[0]).toMatchObject({ toolName: "Terminal" });
  });

  it("keeps the first reported name when the same tool_call id is repeated", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate(
      { sessionUpdate: "tool_call", toolCallId: "dup", kind: "edit", title: "Write PROOF.md", rawInput: { file_path: "PROOF.md" } },
      tracker,
    );
    const repeat = mapAcpUpdate(
      { sessionUpdate: "tool_call", toolCallId: "dup", kind: "edit", title: "Write PROOF.md" },
      tracker,
    );

    expect(repeat.events).toEqual([]);
    expect(tracker.open.get("dup")?.toolName).toBe("edit:PROOF.md");
  });

  it("renders a plan as an agent message", () => {
    const tracker = createToolCallTracker();
    const mapping = mapAcpUpdate(
      {
        sessionUpdate: "plan",
        entries: [
          { content: "Read files", status: "completed" },
          { content: "Apply patch", status: "pending" },
        ],
      },
      tracker,
    );

    expect(mapping.events).toEqual([
      { type: "agent_message", text: "Plan:\n- [completed] Read files\n- [pending] Apply patch" },
    ]);
  });

  it("ignores bookkeeping updates that have no transcript meaning", () => {
    const tracker = createToolCallTracker();
    for (const sessionUpdate of [
      "usage_update",
      "available_commands_update",
      "current_mode_update",
      "config_option_update",
      "session_info_update",
      "something_new",
    ]) {
      expect(mapAcpUpdate({ sessionUpdate }, tracker).events).toEqual([]);
    }
  });
});

describe("flushOpenToolCalls", () => {
  it("closes tool calls the turn never completed", () => {
    const tracker = createToolCallTracker();
    mapAcpUpdate({ sessionUpdate: "tool_call", toolCallId: "open-1", kind: "execute", title: "Bash" }, tracker);
    mapAcpUpdate({ sessionUpdate: "tool_call", toolCallId: "done-1", kind: "read", title: "Read" }, tracker);
    mapAcpUpdate({ sessionUpdate: "tool_call_update", toolCallId: "done-1", status: "completed" }, tracker);

    const events = flushOpenToolCalls(tracker);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_result",
      toolName: "Bash",
      result: { status: "cancelled" },
    });
    expect(tracker.open.size).toBe(0);
  });

  it("returns nothing when every tool call already closed", () => {
    const tracker = createToolCallTracker();
    expect(flushOpenToolCalls(tracker)).toEqual([]);
  });
});
