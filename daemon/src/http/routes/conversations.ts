import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getRepositories } from "../../persistence/factory.js";
import { runStreamTurn, runTurn, isGoalCommand, handleGoalCommand } from "../../runtimes/agent/public-api.js";
import { apiError, extractErrorMessage } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { logAuditEntry } from "../../persistence/audit-log.js";
import { pipeRunStreamToSSE } from "./stream-helpers.js";

const app = new Hono();

// GET / - List all conversations
app.get("/", withErrorHandling("conversations/list", async (c) => {
  const conversations = await getRepositories().conversations.list();
  return c.json({ conversations });
}));

// POST / - Create a new conversation
app.post("/", withErrorHandling("conversations/create", async (c) => {
  const body: { title?: string } = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
  const conversation = await getRepositories().conversations.create(body.title);
  return c.json({ conversation }, 201);
}));

// GET /:id - Get conversation with messages
app.get("/:id", withErrorHandling("conversations/getById", async (c) => {
  const id = c.req.param("id")!;
  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return apiError(c, "Conversation not found", 404);
  }
  const messages = await getRepositories().conversations.getMessages(id);
  return c.json({ conversation, messages });
}));

// POST /batch-delete - Delete multiple conversations
app.post("/batch-delete", withErrorHandling("conversations/batch-delete", async (c) => {
  const body = await c.req.json<{ ids: string[] }>();
  const ids = body.ids ?? [];
  if (ids.length === 0) {
    return c.json({ deleted: 0 });
  }
  const deleted = await getRepositories().conversations.deleteMany(ids);
  await logAuditEntry({
    actor: "user",
    action: "conversation.batch-delete",
    resource: `conversations:${ids.length}`,
    decision: "approved",
    result: "deleted",
    metadata: { count: deleted, ids },
  });
  return c.json({ deleted });
}));

// DELETE /:id - Delete conversation
app.delete("/:id", withErrorHandling("conversations/delete", async (c) => {
  const id = c.req.param("id")!;
  const existing = await getRepositories().conversations.getById(id);
  if (!existing) {
    return apiError(c, "Conversation not found", 404);
  }
  await getRepositories().conversations.delete(id);
  await logAuditEntry({
    actor: "user",
    action: "conversation.delete",
    resource: `conversation:${id}`,
    decision: "approved",
    result: "deleted",
    metadata: { id, title: existing.title },
  });
  return c.json({ success: true });
}));

// PATCH /:id - Update conversation (rename)
app.patch("/:id", withErrorHandling("conversations/update", async (c) => {
  const id = c.req.param("id")!;
  const body: { title?: string } = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
  const conversation = await getRepositories().conversations.update(id, body);
  if (!conversation) {
    return apiError(c, "Conversation not found", 404);
  }
  return c.json({ conversation });
}));

// POST /:id/messages - Send a message in conversation
app.post("/:id/messages", withErrorHandling("conversations/handleMessage", async (c) => {
  const id = c.req.param("id")!;
  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return apiError(c, "Conversation not found", 404);
  }

  const body = await c.req.json<{ content: string }>();
  if (!body.content?.trim()) {
    return apiError(c, "Message content is required", 400);
  }

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
}));

// POST /:id/messages/stream - Send a message and stream the response
app.post("/:id/messages/stream", async (c) => {
  const id = c.req.param("id")!;
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
      c.req.raw.signal.addEventListener("abort", () => abortController.abort());

      await pipeRunStreamToSSE(stream, sseStream, {
        runId,
        conversationId: id,
        onDoneData: async (data) => {
          const { GoalJudge } = await import("../../runtimes/agent/public-api.js");
          const goalJudge = new GoalJudge();
          const goalCheck = await goalJudge.checkAfterTurn(data.fullText);
          return goalCheck.needsContinuation
            ? { goalContinuation: goalCheck.continuationPrompt }
            : undefined;
        },
      });
    });
  } catch (err) {
    const message = extractErrorMessage(err);
    return apiError(c, message, 500);
  }
});

// PUT /:id/messages/:msgId - Edit a message's content
app.put("/:id/messages/:msgId", withErrorHandling("conversations/editMessage", async (c) => {
  const id = c.req.param("id")!;
  const msgId = c.req.param("msgId")!;
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
}));

// POST /:id/messages/:msgId/regenerate - Regenerate assistant response
app.post("/:id/messages/:msgId/regenerate", withErrorHandling("conversations/regenerate", async (c) => {
  const id = c.req.param("id")!;
  const msgId = c.req.param("msgId")!;

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
}));

// GET /:id/messages/:msgId/branches - Get branch alternatives for a message
app.get("/:id/messages/:msgId/branches", withErrorHandling("conversations/getBranches", async (c) => {
  const id = c.req.param("id")!;
  const msgId = c.req.param("msgId")!;

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
}));

// GET /:id/tree - Get conversation tree structure
app.get("/:id/tree", withErrorHandling("conversations/getTree", async (c) => {
  const id = c.req.param("id")!;

  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return apiError(c, "Conversation not found", 404);
  }

  const tree = await getRepositories().conversations.getConversationTree(id);
  return c.json({ tree });
}));

// GET /messages/search?q=keyword&limit=20 - Search across all conversations
app.get("/messages/search", withErrorHandling("conversations/search", async (c) => {
  const query = c.req.query("q");
  if (!query?.trim()) {
    return apiError(c, "Search query is required", 400);
  }

  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const results = await getRepositories().conversations.searchMessages(query, limit);
  return c.json({ results });
}));

// GET /:id/export?format=markdown|json - Export conversation
app.get("/:id/export", withErrorHandling("conversations/export", async (c) => {
  const id = c.req.param("id")!;
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
}));


export default app;
