import { Hono } from "hono";
import { stream } from "hono/streaming";
import { streamChat } from "../orchestrator/conversation.js";
import { ContextBuilder } from "../orchestrator/context-builder.js";
import { getRepositories } from "../db/factory.js";
import { configManager } from "../config/config-manager.js";
import { apiError, extractErrorMessage, classifyError, logError } from "../utils/errors.js";
import { normalizeStream } from "./sse-normalizer.js";
import { withStreamTimeout } from "./stream-timeout.js";
import { runTurn } from "../runtime/run-executor.js";
import type { ModelMessage } from "ai";

const chatRoutes = new Hono();

async function getDefaultRunContext(): Promise<{ workspaceId: string; agentId: string }> {
  const repos = getRepositories();

  let workspace = await repos.workspaces.getDefault("default");
  if (!workspace) {
    workspace = await repos.workspaces.create({
      ownerId: "default",
      name: "Personal",
      description: "Default personal workspace",
    });
  }

  let agent = await repos.agentProfiles.getDefault();
  if (!agent) {
    agent = await repos.agentProfiles.create({
      name: "Jarvis",
      description: "Default personal assistant agent",
      isDefault: true,
    });
  }

  return { workspaceId: workspace.id, agentId: agent.id };
}

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

    const defaults = await getDefaultRunContext();
    const result = await runTurn({
      workspaceId: body.workspaceId ?? defaults.workspaceId,
      projectId: body.projectId,
      taskId: body.taskId,
      conversationId: body.conversationId,
      agentId: body.agentId ?? defaults.agentId,
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
    const { stream: result, abortController: controller } = await streamChat(body.messages);

    return stream(c, async (streamWriter) => {
      // Propagate client disconnect to upstream stream
      c.req.raw.signal.addEventListener("abort", () => {
        logError("[Stream] client disconnected, aborting upstream", new Error("client disconnect"));
        controller.abort();
      });

      try {
        const timeoutMs = configManager.getStreamTimeout();
        const normalized = withStreamTimeout(
          normalizeStream(result.fullStream),
          timeoutMs,
        );

        for await (const event of normalized) {
          if (event.type === "delta") {
            await streamWriter.write(`event: delta\ndata: ${JSON.stringify({ text: event.text })}\n\n`);
          } else if (event.type === "thinking") {
            await streamWriter.write(`event: thinking\ndata: ${JSON.stringify({ text: event.text })}\n\n`);
          }
          // tool_calls / tool_result not surfaced here — chat.ts has no onToolEvent
        }
      } catch (streamErr) {
        logError("chat/stream[mid-stream]", streamErr);
        const message = extractErrorMessage(streamErr);
        await streamWriter.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`).catch(() => {});
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
chatRoutes.post("/debug/context", async (c) => {
  try {
    const body = await c.req.json<{ conversationId?: string; message?: string }>();
    const conversationId = body.conversationId;
    const message = body.message ?? "";

    const repo = getRepositories();
    const memories = await repo.memories.getAll();
    const scoredMemories = memories.map((m) => ({ ...m, score: 0 }));

    // If conversationId provided, fetch history
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
  } catch (err) {
    logError("chat/debug/context", err);
    const { status, code } = classifyError(err);
    return apiError(c, extractErrorMessage(err), status, code);
  }
});

export default chatRoutes;
