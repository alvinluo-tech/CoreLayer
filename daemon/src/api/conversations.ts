import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getRepositories } from "../db/factory.js";
import { isGoalCommand, handleGoalCommand } from "../orchestrator/goal-handler.js";
import { apiError, extractErrorMessage, logError } from "../utils/errors.js";
import { runStreamTurn } from "../runtime/run-stream-executor.js";
import { runTurn } from "../runtime/run-executor.js";

const app = new Hono();

// GET / - List all conversations
app.get("/", async (c) => {
  try {
    const conversations = await getRepositories().conversations.list();
    return c.json({ conversations });
  } catch (err) {
    logError("conversations/list", err);
    return apiError(c, "Failed to list conversations", 500);
  }
});

// POST / - Create a new conversation
app.post("/", async (c) => {
  try {
    const body: { title?: string } = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
    const conversation = await getRepositories().conversations.create(body.title);
    return c.json({ conversation }, 201);
  } catch (err) {
    logError("conversations/create", err);
    return apiError(c, "Failed to create conversation", 500);
  }
});

// GET /:id - Get conversation with messages
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const conversation = await getRepositories().conversations.getById(id);
    if (!conversation) {
      return apiError(c, "Conversation not found", 404);
    }
    const messages = await getRepositories().conversations.getMessages(id);
    return c.json({ conversation, messages });
  } catch (err) {
    logError("conversations/getById", err);
    return apiError(c, "Failed to get conversation", 500);
  }
});

// DELETE /:id - Delete conversation
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const deleted = await getRepositories().conversations.delete(id);
    if (!deleted) {
      return apiError(c, "Conversation not found", 404);
    }
    return c.json({ success: true });
  } catch (err) {
    logError("conversations/delete", err);
    return apiError(c, "Failed to delete conversation", 500);
  }
});

// PATCH /:id - Update conversation (rename)
app.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body: { title?: string } = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
    const conversation = await getRepositories().conversations.update(id, body);
    if (!conversation) {
      return apiError(c, "Conversation not found", 404);
    }
    return c.json({ conversation });
  } catch (err) {
    logError("conversations/update", err);
    return apiError(c, "Failed to update conversation", 500);
  }
});

// POST /:id/messages - Send a message in conversation
app.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return apiError(c, "Conversation not found", 404);
  }

  const body = await c.req.json<{ content: string }>();
  if (!body.content?.trim()) {
    return apiError(c, "Message content is required", 400);
  }

  try {
    const result = await runTurn({
      conversationId: id,
      input: body.content,
      mode: "chat",
    });
    return c.json({
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      conversation: result.conversation,
    });
  } catch (err) {
    logError("conversations/handleMessage", err);
    const message = err instanceof Error ? err.message : String(err);
    return apiError(c, message, 500);
  }
});

// POST /:id/messages/stream - Send a message and stream the response
app.post("/:id/messages/stream", async (c) => {
  const id = c.req.param("id");
  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return apiError(c, "Conversation not found", 404);
  }

  const body = await c.req.json<{ content: string }>();
  if (!body.content?.trim()) {
    return apiError(c, "Message content is required", 400);
  }

  // Intercept /goal commands before reaching LLM
  if (isGoalCommand(body.content)) {
    try {
      const goalResult = await handleGoalCommand(body.content);
      return streamSSE(c, async (sseStream) => {
        await sseStream.writeSSE({ event: "delta", data: JSON.stringify({ text: goalResult.reply }) });
        const repo = getRepositories().conversations;
        const userMsg = await repo.addMessage(id, { role: "user", content: body.content });
        const assistantMsg = await repo.addMessage(id, { role: "assistant", content: goalResult.reply });
        const updatedConv = await repo.getById(id);
        await sseStream.writeSSE({
          event: "done",
          data: JSON.stringify({ userMessage: userMsg, assistantMessage: assistantMsg, conversation: updatedConv }),
        });
      });
    } catch (err) {
      logError("conversations/goal-command", err);
      return apiError(c, extractErrorMessage(err), 500);
    }
  }

  try {
    const abortController = new AbortController();

    const { runId, stream } = await runStreamTurn({
      conversationId: id,
      input: body.content,
      mode: "chat",
    }, { abortController });

    return streamSSE(c, async (sseStream) => {
      // Propagate client disconnect to upstream stream
      c.req.raw.signal.addEventListener("abort", () => {
        logError("[Stream] client disconnected, aborting upstream", new Error("client disconnect"));
        abortController.abort();
      });

      let fullText = "";
      let lastUserMessage: unknown;
      let lastAssistantMessage: unknown;
      let lastConversation: unknown;

      for await (const event of stream) {
        if (event.type === "delta") {
          fullText += event.text;
          await sseStream.writeSSE({
            event: "delta",
            data: JSON.stringify({ text: event.text }),
          });
        } else if (event.type === "tool_call") {
          const tc = event.toolCall;
          if (tc.result !== undefined) {
            await sseStream.writeSSE({
              event: "tool_result",
              data: JSON.stringify({ name: tc.name, toolCallId: tc.id, output: tc.result }),
            });
          } else {
            await sseStream.writeSSE({
              event: "tool_calls",
              data: JSON.stringify({ name: tc.name, toolCallId: tc.id, input: tc.args }),
            });
          }
        } else if (event.type === "run_completed") {
          lastUserMessage = event.result.userMessage;
          lastAssistantMessage = event.result.assistantMessage;
          lastConversation = event.result.conversation;

          // Goal auto-continuation: check if active goals need more work
          const { GoalJudge } = await import("../orchestrator/goal-handler.js");
          const goalJudge = new GoalJudge();
          const goalCheck = await goalJudge.checkAfterTurn(fullText);

          await sseStream.writeSSE({
            event: "done",
            data: JSON.stringify({
              userMessage: lastUserMessage,
              assistantMessage: lastAssistantMessage,
              conversation: lastConversation,
              runId,
              goalContinuation: goalCheck.needsContinuation ? goalCheck.continuationPrompt : undefined,
            }),
          });
        } else if (event.type === "run_failed") {
          await sseStream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: event.error }),
          });
        }
      }
    });
  } catch (err) {
    logError("conversations/stream", err);
    const message = extractErrorMessage(err);
    return apiError(c, message, 500);
  }
});

// PUT /:id/messages/:msgId - Edit a message's content
app.put("/:id/messages/:msgId", async (c) => {
  try {
    const id = c.req.param("id");
    const msgId = c.req.param("msgId");
    const body = await c.req.json<{ content: string }>();

    if (!body.content?.trim()) {
      return apiError(c, "Message content is required", 400);
    }

    const conversation = await getRepositories().conversations.getById(id);
    if (!conversation) {
      return apiError(c, "Conversation not found", 404);
    }

    const messages = await getRepositories().conversations.getMessages(id);
    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg) {
      return apiError(c, "Message not found", 404);
    }

    if (targetMsg.role !== "user") {
      return apiError(c, "Only user messages can be edited", 400);
    }

    const updated = await getRepositories().conversations.editMessage(id, msgId, body.content);
    return c.json({ message: updated });
  } catch (err) {
    logError("conversations/editMessage", err);
    return apiError(c, "Failed to edit message", 500);
  }
});

// POST /:id/messages/:msgId/regenerate - Regenerate assistant response
app.post("/:id/messages/:msgId/regenerate", async (c) => {
  try {
    const id = c.req.param("id");
    const msgId = c.req.param("msgId");

    const conversation = await getRepositories().conversations.getById(id);
    if (!conversation) {
      return apiError(c, "Conversation not found", 404);
    }

    const messages = await getRepositories().conversations.getMessages(id);
    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg) {
      return apiError(c, "Message not found", 404);
    }

    if (targetMsg.role !== "user") {
      return apiError(c, "Can only regenerate after a user message", 400);
    }

    const targetIndex = messages.indexOf(targetMsg);
    const nextMsg = messages[targetIndex + 1];

    if (nextMsg && nextMsg.role === "assistant") {
      await getRepositories().conversations.deleteMessage(nextMsg.id);
    }

    const result = await runTurn({
      conversationId: id,
      input: targetMsg.content,
      mode: "regenerate",
      workspaceId: conversation.workspaceId ?? undefined,
      projectId: conversation.projectId ?? undefined,
      agentId: (await getRepositories().agentProfiles.getDefault())?.id ?? "default",
    });
    return c.json({
      message: result.assistantMessage,
      conversation: result.conversation,
    });
  } catch (err) {
    logError("conversations/regenerate", err);
    const message = err instanceof Error ? err.message : String(err);
    return apiError(c, message, 500);
  }
});

// GET /:id/messages/:msgId/branches - Get branch alternatives for a message
app.get("/:id/messages/:msgId/branches", async (c) => {
  try {
    const id = c.req.param("id");
    const msgId = c.req.param("msgId");

    const conversation = await getRepositories().conversations.getById(id);
    if (!conversation) {
      return apiError(c, "Conversation not found", 404);
    }

    const branches = await getRepositories().conversations.getMessageBranches(msgId);
    const currentIndex = branches.findIndex((b) => b.id === msgId);

    return c.json({
      branches,
      currentIndex,
      total: branches.length,
    });
  } catch (err) {
    logError("conversations/getBranches", err);
    return apiError(c, "Failed to get branches", 500);
  }
});

// GET /:id/tree - Get conversation tree structure
app.get("/:id/tree", async (c) => {
  try {
    const id = c.req.param("id");

    const conversation = await getRepositories().conversations.getById(id);
    if (!conversation) {
      return apiError(c, "Conversation not found", 404);
    }

    const tree = await getRepositories().conversations.getConversationTree(id);
    return c.json({ tree });
  } catch (err) {
    logError("conversations/getTree", err);
    return apiError(c, "Failed to get conversation tree", 500);
  }
});

// GET /messages/search?q=keyword&limit=20 - Search across all conversations
app.get("/messages/search", async (c) => {
  try {
    const query = c.req.query("q");
    if (!query?.trim()) {
      return apiError(c, "Search query is required", 400);
    }

    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    const results = await getRepositories().conversations.searchMessages(query, limit);
    return c.json({ results });
  } catch (err) {
    logError("conversations/search", err);
    return apiError(c, "Failed to search messages", 500);
  }
});

// GET /:id/export?format=markdown|json - Export conversation
app.get("/:id/export", async (c) => {
  try {
    const id = c.req.param("id");
    const format = c.req.query("format") ?? "markdown";

    const conversation = await getRepositories().conversations.getById(id);
    if (!conversation) {
      return apiError(c, "Conversation not found", 404);
    }

    const messages = await getRepositories().conversations.getMessages(id);

    if (format === "json") {
      return c.json({
        id: conversation.id,
        title: conversation.title,
        model: conversation.modelUsed,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
          createdAt: m.createdAt,
        })),
        exportedAt: new Date().toISOString(),
      });
    }

    const lines: string[] = [
      `# ${conversation.title}`,
      "",
      `**Model**: ${conversation.modelUsed}`,
      `**Date**: ${conversation.createdAt}`,
      "",
      "---",
      "",
    ];

    for (const msg of messages) {
      if (msg.role === "user") {
        lines.push("## User");
        lines.push(msg.content);
        lines.push("");
      } else if (msg.role === "assistant") {
        lines.push("## Assistant");
        lines.push(msg.content);
        if (msg.toolCalls) {
          const toolCalls = JSON.parse(msg.toolCalls) as { name: string; result: unknown }[];
          for (const tc of toolCalls) {
            lines.push("");
            lines.push(`### Tool: ${tc.name}`);
            lines.push("```json");
            lines.push(JSON.stringify(tc.result, null, 2));
            lines.push("```");
          }
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }

    return c.text(lines.join("\n"), 200, { "Content-Type": "text/markdown; charset=utf-8" });
  } catch (err) {
    logError("conversations/export", err);
    return apiError(c, "Failed to export conversation", 500);
  }
});


export default app;
