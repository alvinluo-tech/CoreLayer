import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getRepositories } from "../db/factory.js";
import { handleMessageInConversation, streamMessageInConversation } from "../orchestrator/conversation.js";
import { apiError, logError } from "../utils/errors.js";

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
    const result = await handleMessageInConversation(id, body.content);
    return c.json(result);
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

  try {
    const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];
    const toolCallIndexByCallId = new Map<string, number>();

    return streamSSE(c, async (sseStream) => {
      const streamResult = await streamMessageInConversation(id, body.content, async (event) => {
        if (event.type === 'tool-call') {
          const index = toolCallsLog.length;
          toolCallsLog.push({ name: event.name, args: event.args ?? null, result: null });
          toolCallIndexByCallId.set(event.toolCallId, index);
          await sseStream.writeSSE({
            event: 'tool-call',
            data: JSON.stringify({ name: event.name, toolCallId: event.toolCallId, args: event.args }),
          });
        } else if (event.type === 'tool-result') {
          const index = toolCallIndexByCallId.get(event.toolCallId);
          if (index !== undefined && toolCallsLog[index]) {
            toolCallsLog[index].result = event.result;
          }
          await sseStream.writeSSE({
            event: 'tool-result',
            data: JSON.stringify({ name: event.name, toolCallId: event.toolCallId, result: event.result }),
          });
        }
      });

      // If it's AI-enabled, stream the LLM response
      if (streamResult.isAi && streamResult.result) {
        let fullText = "";

        try {
          // Iterate over textStream to capture text tokens (highly stable)
          for await (const chunk of streamResult.result.textStream) {
            fullText += chunk;
            await sseStream.writeSSE({
              event: "token",
              data: JSON.stringify({ text: chunk }),
            });
          }

          // Save assistant message to database when complete
          const savedAssistantMsg = await streamResult.saveAssistantMessage(fullText, toolCallsLog);
          const updatedConv = await getRepositories().conversations.getById(id);

          await sseStream.writeSSE({
            event: "done",
            data: JSON.stringify({
              userMessage: streamResult.userMessage,
              assistantMessage: savedAssistantMsg,
              conversation: updatedConv,
            }),
          });
        } catch (err) {
          logError("conversations/stream/ai", err);
          const message = err instanceof Error ? err.message : String(err);
          await sseStream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: message }),
          });
        }
      } else {
        // Non-AI fallback: stream local response in one chunk
        try {
          await sseStream.writeSSE({
            event: "token",
            data: JSON.stringify({ text: streamResult.reply || "" }),
          });

          const savedAssistantMsg = await streamResult.saveAssistantMessage(
            streamResult.reply || "",
            streamResult.toolCalls || [],
          );
          const updatedConv = await getRepositories().conversations.getById(id);

          await sseStream.writeSSE({
            event: "done",
            data: JSON.stringify({
              userMessage: streamResult.userMessage,
              assistantMessage: savedAssistantMsg,
              conversation: updatedConv,
            }),
          });
        } catch (err) {
          logError("conversations/stream/local", err);
          const message = err instanceof Error ? err.message : String(err);
          await sseStream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: message }),
          });
        }
      }
    });
  } catch (err) {
    logError("conversations/stream", err);
    const message = err instanceof Error ? err.message : String(err);
    return apiError(c, message, 500);
  }
});


export default app;
