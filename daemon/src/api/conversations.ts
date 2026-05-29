import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getRepositories } from "../db/factory.js";
import { handleMessageInConversation, streamMessageInConversation } from "../orchestrator/conversation.js";


const app = new Hono();

// GET / - List all conversations
app.get("/", async (c) => {
  const conversations = await getRepositories().conversations.list();
  return c.json({ conversations });
});

// POST / - Create a new conversation
app.post("/", async (c) => {
  const body: { title?: string } = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
  const conversation = await getRepositories().conversations.create(body.title);
  return c.json({ conversation }, 201);
});

// GET /:id - Get conversation with messages
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  const messages = await getRepositories().conversations.getMessages(id);
  return c.json({ conversation, messages });
});

// DELETE /:id - Delete conversation
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await getRepositories().conversations.delete(id);
  if (!deleted) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  return c.json({ success: true });
});

// PATCH /:id - Update conversation (rename)
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body: { title?: string } = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
  const conversation = await getRepositories().conversations.update(id, body);
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  return c.json({ conversation });
});

// POST /:id/messages - Send a message in conversation
app.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const body = await c.req.json<{ content: string }>();
  if (!body.content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  try {
    const result = await handleMessageInConversation(id, body.content);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

// POST /:id/messages/stream - Send a message and stream the response
app.post("/:id/messages/stream", async (c) => {
  const id = c.req.param("id");
  const conversation = await getRepositories().conversations.getById(id);
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const body = await c.req.json<{ content: string }>();
  if (!body.content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  try {
    const streamResult = await streamMessageInConversation(id, body.content);

    return streamSSE(c, async (sseStream) => {
      // If it's AI-enabled, stream the LLM response
      if (streamResult.isAi && streamResult.result) {
        let fullText = "";
        const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];

        try {
          // Iterate over textStream to capture text tokens (highly stable)
          for await (const chunk of streamResult.result.textStream) {
            fullText += chunk;
            await sseStream.writeSSE({
              event: "token",
              data: JSON.stringify({ text: chunk }),
            });
          }

          // Safely wait for tool calls and results to resolve
          const toolCalls = (await streamResult.result.toolCalls) || [];
          const toolResults = (await streamResult.result.toolResults) || [];

          for (const tc of toolCalls) {
            const tr = toolResults.find((r: any) => r.toolCallId === tc.toolCallId);
            toolCallsLog.push({
              name: tc.toolName,
              args: tc.args,
              result: tr ? tr.result : null,
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await sseStream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: message }),
          });
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});


export default app;
