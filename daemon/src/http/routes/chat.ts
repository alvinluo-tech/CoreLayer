import { Hono } from "hono";
import { stream } from "hono/streaming";
import { ContextBuilder, runTurn, runStreamTurn } from "../../runtimes/agent/public-api.js";
import { getRepositories } from "../../persistence/factory.js";
import { configManager } from "../../config/config-manager.js";
import { apiError, extractErrorMessage, classifyError, logError } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { pipeRunStreamToWriter, writeStreamError } from "./stream-helpers.js";

const chatRoutes = new Hono();

/**
 * Non-streaming chat endpoint.
 * Accepts { message: string, conversationId?: string, modelOverride?: string }
 * and routes through the AgentRun runtime backbone.
 */
chatRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json<{
      message: string;
      conversationId?: string;
      workspaceId?: string;
      projectId?: string;
      taskId?: string;
      agentId?: string;
      modelOverride?: string;
    }>();
    if (!body.message?.trim()) {
      return apiError(c, "消息不能为空", 400);
    }

    const result = await runTurn({
      workspaceId: body.workspaceId,
      projectId: body.projectId,
      taskId: body.taskId,
      conversationId: body.conversationId,
      agentId: body.agentId,
      mode: "chat",
      input: body.message,
      modelOverride: body.modelOverride,
    });

    return c.json({
      reply: result.text,
      toolCalls: [],
      runId: result.runId,
      conversationId: result.conversationId,
      events: result.events,
    });
  } catch (err) {
    logError("chat/send", err);
    const { status, code } = classifyError(err);
    return apiError(c, extractErrorMessage(err), status, code);
  }
});

/**
 * Streaming chat endpoint.
 * Accepts { message: string, conversationId?: string } and returns SSE stream.
 * Routes through the AgentRun runtime backbone for full lifecycle tracking.
 */
chatRoutes.post("/stream", async (c) => {
  try {
    const body = await c.req.json<{
      message: string;
      conversationId?: string;
      workspaceId?: string;
      projectId?: string;
      agentId?: string;
      modelOverride?: string;
    }>();

    if (!body.message?.trim()) {
      return apiError(c, "消息不能为空", 400);
    }

    const abortController = new AbortController();

    c.req.raw.signal.addEventListener("abort", () => {
      abortController.abort();
    });

    const result = await runStreamTurn(
      {
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        conversationId: body.conversationId,
        agentId: body.agentId,
        mode: "chat",
        input: body.message,
        modelOverride: body.modelOverride,
      },
      { abortController },
    );

    return stream(c, async (streamWriter) => {
      try {
        await pipeRunStreamToWriter(result.stream, streamWriter, {
          runId: result.runId,
          conversationId: body.conversationId,
        });
      } catch (streamErr) {
        await writeStreamError(streamWriter, streamErr, "chat/stream[mid-stream]");
      }
    });
  } catch (err) {
    logError("chat/stream", err);
    const { status, code } = classifyError(err);
    return apiError(c, extractErrorMessage(err), status, code);
  }
});

/**
 * Debug endpoint: inspect context assembly for a conversation.
 * Accepts { conversationId: string, message?: string }
 * Returns per-component token usage, memory items, tool catalog info.
 */
chatRoutes.post("/debug/context", withErrorHandling("chat/debug/context", async (c) => {
  const body = await c.req.json<{ conversationId?: string; message?: string }>();
  const conversationId = body.conversationId;
  const message = body.message ?? "";

  const repo = getRepositories();
  const memories = await repo.memories.getAll();
  const scoredMemories = memories.map((m) => ({ ...m, score: 0 }));

  let history: Awaited<ReturnType<typeof repo.conversations.getMessages>> = [];
  if (conversationId) {
    history = await repo.conversations.getMessages(conversationId);
  }

  const builder = new ContextBuilder({
    mode: "text",
    conversationId,
    modelName: configManager.getActiveModel(),
    userMessage: message,
  });

  const context = await builder.build(scoredMemories, history);
  const debugInfo = context.debug();

  return c.json(debugInfo);
}));

export default chatRoutes;
