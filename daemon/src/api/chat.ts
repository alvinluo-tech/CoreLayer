import { Hono } from "hono";
import { stream } from "hono/streaming";
import { handleMessage, streamChat } from "../orchestrator/conversation.js";
import { apiError, extractErrorMessage, classifyError, logError } from "../utils/errors.js";
import type { ModelMessage } from "ai";

const chatRoutes = new Hono();

/**
 * Non-streaming chat endpoint (legacy).
 * Accepts { message: string } and returns full response.
 */
chatRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json<{ message: string }>();
    if (!body.message?.trim()) {
      return apiError(c, "消息不能为空", 400);
    }
    const result = await handleMessage(body.message);
    return c.json(result);
  } catch (err) {
    logError("chat/send", err);
    const { status, code } = classifyError(err);
    return apiError(c, extractErrorMessage(err), status, code);
  }
});

/**
 * Streaming chat endpoint.
 * Accepts { messages: ModelMessage[] } and returns SSE stream.
 * Uses Vercel AI SDK streamText with automatic tool calling.
 */
chatRoutes.post("/stream", async (c) => {
  try {
    const body = await c.req.json<{ messages: ModelMessage[] }>();

    if (!body.messages?.length) {
      return apiError(c, "消息不能为空", 400);
    }

    // streamChat may throw immediately if the model is not configured
    const result = streamChat(body.messages);

    return stream(c, async (streamWriter) => {
      streamWriter.onAbort(() => {
        // Client disconnected — no action needed, stream closes naturally
      });

      try {
        for await (const chunk of result.textStream) {
          await streamWriter.write(chunk);
        }
      } catch (streamErr) {
        logError("chat/stream[mid-stream]", streamErr);
        // Best-effort: write error marker to already-open stream
        await streamWriter.write(`\n\n[ERROR: ${extractErrorMessage(streamErr)}]`).catch(() => {});
      }
    });
  } catch (err) {
    logError("chat/stream", err);
    const { status, code } = classifyError(err);
    return apiError(c, extractErrorMessage(err), status, code);
  }
});

export default chatRoutes;
