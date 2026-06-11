import { generateText, streamText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { ContextBuilder } from "./context-builder.js";
import { compressConversation, createSummaryMessage, extractMemoriesFromTurn } from "./compressor.js";
import { getAllTools, wrapToolsForAI, isApprovalRequiredMarker, extractApprovalRequestIds } from "../../tool/public-api.js";

import { configManager } from "../../../config/config-manager.js";
import { getModelGateway } from "../../../gateways/model/gateway.js";
import { getRepositories } from "../../../persistence/factory.js";
import type { MessageRow, ConversationRow } from "../../../persistence/repository.js";
import { classifyError, extractErrorMessage, logError } from "../../../shared/errors.js";
import { recordActivity } from "../../scheduler/public-api.js";

// Extracted modules
import { shouldSkipCompression, markCompressionStarted, markCompressionFinished, resetCompressionCount } from "./compression-state.js";
import { IterationBudget, injectBudgetWarning } from "./iteration-budget.js";
import { LoopBreaker, injectLoopBreakerWarning } from "./loop-breaker.js";
import { ForceAnswerDetector, FORCE_ANSWER_ROUNDS, FORCE_ANSWER_MSG } from "./force-answer.js";
import { guardEmptyResponse } from "./response-guard.js";
import { applyCacheControl, logCacheStats, CACHE_CONTROL } from "./cache-control.js";
import { selectModelForConversation } from "./model-routing.js";
import { fetchRelevantMemories, extractSummaryFromHistory } from "./memory-fetcher.js";
import { handleLocally } from "./local-handler.js";

export function isAiConfigured(): boolean {
  const creds = configManager.getCredentials();
  return Object.values(creds).some((v) => v);
}

export function generateTitleFromMessage(message: string): string {
  const cleaned = message.replace(/\n/g, " ").trim();
  return cleaned.length > 30 ? cleaned.slice(0, 30) + "..." : cleaned;
}

/** Options for conversation message handling (used by TICK, scheduled tasks, etc.) */
export interface ConversationOptions {
  modelOverride?: string;
  providerOverride?: string;
  systemPromptOverride?: string;
  /** External AbortController for run cancellation */
  abortController?: AbortController;
  /** Runtime context for tool approval and audit */
  runtimeContext?: {
    runId?: string;
    projectId?: string;
    mode?: string;
  };
  /** Called when memories are fetched for context injection */
  onMemoryRead?: (memoryIds: string[]) => void;
  /** Called when memories are extracted and written after a turn */
  onMemoryWritten?: (memoryIds: string[]) => void;
}

/**
 * Handle a message within a conversation context (non-streaming).
 * Uses Vercel AI SDK generateText with automatic tool calling.
 */
export async function handleMessageInConversation(
  conversationId: string,
  userMessage: string,
  options?: ConversationOptions,
): Promise<{
  userMessage: MessageRow;
  assistantMessage: MessageRow;
  conversation: ConversationRow;
  suspended?: boolean;
  approvalRequestIds?: string[];
}> {
  const streamResult = await streamMessageInConversation(conversationId, userMessage, undefined, options?.abortController, options);

  // Non-AI local fallback: save and return directly
  if (!streamResult.isAi) {
    const savedAssistantMsg = await streamResult.saveAssistantMessage(
      streamResult.reply ?? "",
      streamResult.toolCalls ?? [],
    );
    const conversation = (await getRepositories().conversations.getById(conversationId))!;
    return {
      userMessage: streamResult.userMessage,
      assistantMessage: savedAssistantMsg,
      conversation,
    };
  }

  // If the run was suspended due to approval required, do NOT save an assistant message
  // and return the suspension info so the caller can set waiting_for_approval status.
  if (streamResult.suspended) {
    const conversation = (await getRepositories().conversations.getById(conversationId))!;
    // Return a minimal result — no assistant message saved
    return {
      userMessage: streamResult.userMessage,
      assistantMessage: { id: "", conversationId, role: "assistant", content: "", createdAt: "" } as MessageRow,
      conversation,
      suspended: true,
      approvalRequestIds: streamResult.approvalRequestIds,
    };
  }

  // AI path: consume the stream to get full text
  let fullText = "";
  const r = streamResult.result as { fullStream: AsyncIterable<{ type: string; text?: string }> };
  for await (const event of r.fullStream) {
    if (event.type === "text-delta" && event.text) {
      fullText += event.text;
    }
  }

  // Handle force answer if needed
  if (streamResult.needsForceAnswer && streamResult.forceAnswerFollowUp) {
    const forcedText = await streamResult.forceAnswerFollowUp();
    if (forcedText) {
      fullText = forcedText;
    }
  }

  // Save assistant message (triggers compression internally)
  const savedAssistantMsg = await streamResult.saveAssistantMessage(
    fullText,
    streamResult.toolCallsLog ?? [],
  );

  const conversation = (await getRepositories().conversations.getById(conversationId))!;

  return {
    userMessage: streamResult.userMessage,
    assistantMessage: savedAssistantMsg,
    conversation,
  };
}

/**
 * Handle a message within a conversation context (streaming).
 * Saves user message, triggers streamText, and returns callback to save assistant message at finish.
 */
export async function streamMessageInConversation(
  conversationId: string,
  userMessage: string,
  onToolEvent?: (event: { type: 'tool-call' | 'tool-result'; name: string; toolCallId: string; args?: unknown; result?: unknown }) => void | Promise<void>,
  abortController?: AbortController,
  options?: ConversationOptions,
): Promise<{
  isAi: boolean;
  userMessage: MessageRow;
  result?: unknown;
  reply?: string;
  toolCalls?: unknown[];
  toolCallsLog?: { name: string; args: unknown; result: unknown }[];
  abortController?: AbortController;
  needsForceAnswer?: boolean;
  forceAnswerFollowUp?: () => Promise<string>;
  saveAssistantMessage: (reply: string, toolCallsLog: unknown[]) => Promise<MessageRow>;
  suspended?: boolean;
  approvalRequestIds?: string[];
}> {
  recordActivity();
  const repo = getRepositories().conversations;

  // Reset compression count for new turn
  resetCompressionCount(conversationId);

  // Persist user message
  const savedUserMsg = await repo.addMessage(conversationId, {
    role: "user",
    content: userMessage,
  });

  // Auto-generate title from first message
  const conversation = await repo.getById(conversationId);
  if (conversation && conversation.title === "New Chat" && conversation.messageCount <= 1) {
    const title = generateTitleFromMessage(userMessage);
    await repo.update(conversationId, { title });
  }

  // Load message history and assemble context
  const history = await repo.getMessages(conversationId);

  // Build scope for memory retrieval from conversation context
  let memoryScope: { type: "user" | "workspace" | "project" | "agent" | "task" | "conversation"; id: string } | null = null;
  if (conversation?.projectId) {
    memoryScope = { type: "project", id: conversation.projectId };
  } else if (conversation?.workspaceId) {
    memoryScope = { type: "workspace", id: conversation.workspaceId };
  }

  const memories = await fetchRelevantMemories(userMessage, 15, memoryScope);
  if (memories.length > 0 && options?.onMemoryRead) {
    options.onMemoryRead(memories.map((m) => m.id));
  }
  const summary = extractSummaryFromHistory(history);

  const selectedModel = options?.modelOverride ?? selectModelForConversation(userMessage, true, history.length);

  // Update conversation model if it changed
  if (conversation && conversation.modelUsed !== selectedModel) {
    try {
      await repo.update(conversationId, { modelUsed: selectedModel });
    } catch (err) {
      logError("streamMessageInConversation/updateModel", err);
    }
  }

  const builder = new ContextBuilder({
    mode: "text",
    conversationId,
    modelName: selectedModel,
    userMessage,
    systemPromptOverride: options?.systemPromptOverride,
  });
  if (summary) builder.withSummary(summary);

  const context = await builder.build(memories, history);

  const saveAssistantMessage = async (reply: string, toolCallsLog: unknown[]) => {
    // Save assistant message
    const msg = await repo.addMessage(conversationId, {
      role: "assistant",
      content: reply,
      toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
      modelUsed: selectedModel,
    });

    // Trigger compression if needed after response is saved
    // Re-fetch messages to include the latest assistant reply
    if (context.shouldCompress && isAiConfigured() && !shouldSkipCompression(conversationId)) {
      markCompressionStarted(conversationId);
      repo.getMessages(conversationId)
        .then((currentHistory) => compressConversation(currentHistory, conversationId))
        .then(async (compaction) => {
          if (compaction.summary && compaction.compressedMessages.length > 0) {
            // Mark compressed messages instead of deleting them
            const compressedIds = compaction.compressedMessages.map((m) => m.id);
            await repo.markMessagesCompressed(compressedIds);

            const summaryMsg = createSummaryMessage(
              conversationId,
              compaction.summary,
              compaction.compressedMessages.length,
            );
            await repo.addMessage(conversationId, summaryMsg);
          }
          // Store extracted preferences as tier:'preference' memories
          if (compaction.extractedPreferences.length > 0) {
            const { memories } = getRepositories();
            await memories.upsertPreferences(compaction.extractedPreferences);
          }
        })
        .catch((err) => {
          logError("streamMessageInConversation/compress", err);
        })
        .finally(() => {
          markCompressionFinished(conversationId);
        });
    }

    // Per-turn memory extraction (fire-and-forget, BaiLongma Recognizer pattern)
    if (isAiConfigured()) {
      extractMemoriesFromTurn(userMessage, reply)
        .then(async (extracted) => {
          if (extracted.length > 0) {
            const { memories } = getRepositories();
            const writtenIds: string[] = [];
            for (const mem of extracted) {
              const saved = await memories.upsert({
                key: mem.key,
                value: mem.value,
                type: mem.type,
                scopeType: memoryScope?.type,
                scopeId: memoryScope?.id,
              });
              writtenIds.push(saved.id);
            }
            options?.onMemoryWritten?.(writtenIds);
            console.info(`[Memory] extracted ${extracted.length} memories from turn`);
          }
        })
        .catch((err) => {
          logError("streamMessageInConversation/extractMemories", err);
        });
    }

    return msg;
  };

  if (isAiConfigured()) {
    try {
      const rawTools = wrapToolsForAI(getAllTools(), {
        conversationId,
        runId: options?.runtimeContext?.runId,
        projectId: options?.runtimeContext?.projectId,
        mode: options?.runtimeContext?.mode as "chat" | "voice" | "tick" | "scheduled" | "workflow" | "regenerate",
      });
      const { messages: aiMessages, tools: aiTools } = context.cacheEnabled
        ? applyCacheControl(context.messages, rawTools)
        : { messages: context.messages, tools: rawTools };

      const maxSteps = configManager.getMaxSteps();
      const budget = new IterationBudget(maxSteps);
      const forceDetector = new ForceAnswerDetector();
      const loopBreaker = new LoopBreaker();
      let loopDetected = false;
      let runSuspended = false;
      let suspendedApprovalRequestIds: string[] = [];

      // Token usage accumulator
      const tokenUsage = { promptTokens: 0, completionTokens: 0 };

      // Tool calls log accumulator (consumed by wrapper and SSE caller)
      const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];

      // Set up turn timeout via AbortController (watchdog)
      const controller = abortController ?? new AbortController();
      const turnTimeout = configManager.getTurnTimeout();
      const timeoutId = setTimeout(() => {
        logError(`[Turn] timed out after ${turnTimeout}ms`, new Error("turn timeout"));
        controller.abort();
      }, turnTimeout);

      const result = streamText({
        model: getModelGateway().getModel(selectedModel),
        messages: aiMessages,
        tools: aiTools,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: controller.signal,
        onFinish: async (event: unknown) => {
          clearTimeout(timeoutId);
          const e = event as Record<string, unknown>;
          logCacheStats(e.providerMetadata as Record<string, unknown> | undefined, "streamMessage");
          // Persist accumulated token usage
          if (tokenUsage.promptTokens > 0 || tokenUsage.completionTokens > 0) {
            try {
              repo.updateTokenUsage(conversationId, tokenUsage.promptTokens, tokenUsage.completionTokens);
              console.info(`[Tokens] conversation ${conversationId}: prompt=${tokenUsage.promptTokens} completion=${tokenUsage.completionTokens}`);
            } catch (err) {
              logError("onFinish/updateTokenUsage", err);
            }
          }
        },
        onStepFinish: async (step: unknown) => {
          const s = step as Record<string, unknown>;
          // Accumulate token usage from each step
          const usage = s.usage as Record<string, unknown> | undefined;
          if (usage) {
            tokenUsage.promptTokens += (usage.inputTokens as number) ?? 0;
            tokenUsage.completionTokens += (usage.outputTokens as number) ?? 0;
          }

          const toolCalls = (s.toolCalls ?? []) as Array<Record<string, unknown>>;
          let toolResults = (s.toolResults ?? []) as Array<Record<string, unknown>>;

          // Detect approval-required tool results and suspend the run
          for (const tr of toolResults) {
            const output = tr.output ?? tr.result;
            if (isApprovalRequiredMarker(output)) {
              const ids = extractApprovalRequestIds(output);
              console.info(`[Approval] Tool requires approval, suspending run. Request IDs: ${ids.join(", ")}`);
              suspendedApprovalRequestIds = ids;
              runSuspended = true;
              controller.abort();
              return;
            }
          }

          // Track iteration budget and inject warning if needed
          if (budget.advance()) {
            toolResults = injectBudgetWarning(toolResults);
          }

          // Track force answer: consecutive tool-only rounds
          forceDetector.recordStep({ text: s.text as string, toolCalls: s.toolCalls as Record<string, unknown>[] });

          // Track loop breakage: stuck (same tool + similar args) or excessive (single tool overuse)
          for (const tc of toolCalls) {
            const { stuck, excessive } = loopBreaker.recordToolCall(tc.toolName as string, tc.input ?? tc.args);
            if (stuck || excessive) {
              loopDetected = true;
            }
          }
          if (loopDetected) {
            toolResults = injectLoopBreakerWarning(toolResults);
          }

          if (onToolEvent) {
            for (const tc of toolCalls) {
              await onToolEvent({
                type: 'tool-call',
                name: tc.toolName as string,
                toolCallId: tc.toolCallId as string,
                args: tc.input ?? tc.args,
              });
            }
            for (const tr of toolResults) {
              await onToolEvent({
                type: 'tool-result',
                name: tr.toolName as string,
                toolCallId: tr.toolCallId as string,
                result: tr.output ?? tr.result,
              });
            }
          }

          // Accumulate tool calls log for callers that need it after stream completes
          for (const tc of toolCalls) {
            toolCallsLog.push({
              name: tc.toolName as string,
              args: tc.input ?? tc.args,
              result: null,
            });
          }
          for (const tr of toolResults) {
            const entry = toolCallsLog.find((e) => e.name === tr.toolName && e.result === null);
            if (entry) {
              entry.result = tr.output ?? tr.result;
            }
          }
        },
      });

      return {
        isAi: true,
        userMessage: savedUserMsg,
        result,
        toolCallsLog,
        abortController: controller,
        suspended: runSuspended,
        approvalRequestIds: suspendedApprovalRequestIds,
        needsForceAnswer: forceDetector.count >= FORCE_ANSWER_ROUNDS || loopDetected,
        forceAnswerFollowUp: (forceDetector.count >= FORCE_ANSWER_ROUNDS || loopDetected)
          ? async () => {
              console.info("[ForceAnswer] stream ended on tool loop, forcing text response");
              const forced = await generateText({
                model: getModelGateway().getModel(selectedModel),
                messages: [
                  ...aiMessages,
                  { role: "assistant" as const, content: "" },
                  { role: "user" as const, content: FORCE_ANSWER_MSG },
                ],
              });
              if (forced.totalUsage) {
                try {
                  repo.updateTokenUsage(
                    conversationId,
                    forced.totalUsage.inputTokens ?? 0,
                    forced.totalUsage.outputTokens ?? 0,
                  );
                } catch (err) {
                  logError("forceAnswerFollowUp/updateTokenUsage", err);
                }
              }
              return guardEmptyResponse(forced as { text: string; reasoning?: string | { text: string }[] });
            }
          : undefined,
        saveAssistantMessage,
      };
    } catch (err) {
      logError("streamMessageInConversation/streamText", err);
      const { code } = classifyError(err);
      throw Object.assign(new Error(extractErrorMessage(err)), { code });
    }
  } else {
    const localResult = await handleLocally(userMessage);
    return {
      isAi: false,
      userMessage: savedUserMsg,
      reply: localResult.reply,
      toolCalls: localResult.toolCalls,
      toolCallsLog: localResult.toolCalls,
      saveAssistantMessage,
    };
  }
}

export async function streamChat(
  messages: ModelMessage[],
  mode: "text" | "voice" = "text",
  conversationId?: string,
  onToolEvent?: (event: { type: 'tool-call' | 'tool-result'; name: string; toolCallId: string; args?: unknown; result?: unknown }) => void | Promise<void>,
  abortController?: AbortController,
  runtimeContext?: { runId?: string; projectId?: string; mode?: string },
  onMemoryRead?: (memoryIds: string[]) => void,
  onApprovalSuspension?: (approvalRequestIds: string[]) => void,
): Promise<{ stream: ReturnType<typeof streamText>; abortController: AbortController; selectedModel: string }> {
  try {
    const selectedModel = selectModelForConversation(messages[0]?.content?.toString() ?? "", false, 0);

    // Build memory scope from conversation context
    let memoryScope: { type: "user" | "workspace" | "project" | "agent" | "task" | "conversation"; id: string } | null = null;
    if (conversationId) {
      const conversation = await getRepositories().conversations.getById(conversationId);
      if (conversation?.projectId) {
        memoryScope = { type: "project", id: conversation.projectId };
      } else if (conversation?.workspaceId) {
        memoryScope = { type: "workspace", id: conversation.workspaceId };
      }
    }

    // Fetch relevant memories for streaming path
    const userMessage = messages[messages.length - 1]?.content?.toString() ?? "";
    const memories = await fetchRelevantMemories(userMessage, 15, memoryScope);
    if (memories.length > 0 && onMemoryRead) {
      onMemoryRead(memories.map((m) => m.id));
    }

    const builder = new ContextBuilder({
      mode,
      conversationId,
      modelName: selectedModel,
    });
    const context = await builder.build(memories, []);

    const rawTools = wrapToolsForAI(getAllTools(), {
      conversationId,
      runId: runtimeContext?.runId,
      projectId: runtimeContext?.projectId,
      mode: runtimeContext?.mode as "chat" | "voice" | "tick" | "scheduled" | "workflow" | "regenerate",
    });
    const aiTools = context.cacheEnabled
      ? applyCacheControl([], rawTools).tools
      : rawTools;

    const systemMessage = context.cacheEnabled
      ? { role: "system" as const, content: context.messages[0].content as string, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
      : context.messages[0].content as string;

    const maxSteps = configManager.getMaxSteps();
    const budget = new IterationBudget(maxSteps);

    const controller = abortController ?? new AbortController();
    const streamTimeout = configManager.getStreamTimeout();
    const timeoutId = setTimeout(() => {
      logError(`[Stream] timed out after ${streamTimeout}ms`, new Error("stream timeout"));
      controller.abort();
    }, streamTimeout);

    const stream = streamText({
      model: getModelGateway().getModel(selectedModel),
      system: systemMessage,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: controller.signal,
      onFinish: async (event: unknown) => {
        clearTimeout(timeoutId);
        const e = event as Record<string, unknown>;
        logCacheStats(e.providerMetadata as Record<string, unknown> | undefined, "streamChat");
      },
      onStepFinish: async (step: unknown) => {
        const s = step as Record<string, unknown>;
        const toolCalls = (s.toolCalls ?? []) as Array<Record<string, unknown>>;
        let toolResults = (s.toolResults ?? []) as Array<Record<string, unknown>>;

        // Track iteration budget and inject warning if needed
        if (budget.advance()) {
          toolResults = injectBudgetWarning(toolResults);
        }

        if (onToolEvent) {
          for (const tc of toolCalls) {
            await onToolEvent({
              type: 'tool-call',
              name: tc.toolName as string,
              toolCallId: tc.toolCallId as string,
              args: tc.input ?? tc.args,
            });
          }
          for (const tr of toolResults) {
            await onToolEvent({
              type: 'tool-result',
              name: tr.toolName as string,
              toolCallId: tr.toolCallId as string,
              result: tr.output ?? tr.result,
            });
          }
        }

        // Detect approval-required tool results and suspend the run
        for (const tr of toolResults) {
          const output = tr.output ?? tr.result;
          if (isApprovalRequiredMarker(output)) {
            const ids = extractApprovalRequestIds(output);
            console.info(`[Approval] Tool requires approval, suspending run. Request IDs: ${ids.join(", ")}`);
            onApprovalSuspension?.(ids);
            controller.abort();
            return;
          }
        }
      },
    });

    return { stream, abortController: controller, selectedModel };
  } catch (err) {
    logError("streamChat", err);
    const { code } = classifyError(err);
    throw Object.assign(new Error(extractErrorMessage(err)), { code });
  }
}


/**
 * Legacy handler for backward compatibility (no conversation context).
 */
export async function handleMessage(userMessage: string): Promise<{
  reply: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
}> {
  if (!isAiConfigured()) {
    return handleLocally(userMessage);
  }

  const selectedModel = selectModelForConversation(userMessage, true, 0);

  const builder = new ContextBuilder({
    mode: "text",
    modelName: selectedModel,
    userMessage,
  });
  const context = await builder.build([], []);

  const rawTools = wrapToolsForAI(getAllTools());
  const aiTools = context.cacheEnabled
    ? applyCacheControl([], rawTools).tools
    : rawTools;

  const systemMessage = context.cacheEnabled
    ? { role: "system" as const, content: context.messages[0].content as string, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
    : context.messages[0].content as string;

  const maxSteps = configManager.getMaxSteps();
  const result = await generateText({
    model: getModelGateway().getModel(selectedModel),
    system: systemMessage,
    messages: [{ role: "user", content: userMessage }],
    tools: aiTools,
    stopWhen: stepCountIs(maxSteps),
  });

  logCacheStats(result.providerMetadata as Record<string, unknown> | undefined, "handleMessage");

  // Force answer: if loop ended on tool-only steps, force a text response
  const forceDetector = new ForceAnswerDetector();
  for (const step of result.steps ?? []) {
    forceDetector.recordStep({ text: step.text, toolCalls: step.toolCalls });
  }

  let reply: string;
  if (forceDetector.count >= FORCE_ANSWER_ROUNDS) {
    console.info("[ForceAnswer] model stuck in tool loop, forcing text response");
    const forced = await generateText({
      model: getModelGateway().getModel(selectedModel),
      system: systemMessage,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "" },
        { role: "user", content: FORCE_ANSWER_MSG },
      ],
    });
    reply = guardEmptyResponse(forced as { text: string; reasoning?: string | { text: string }[] });
  } else {
    reply = guardEmptyResponse(result as { text: string; reasoning?: string | { text: string }[] });
  }

  const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];
  for (const step of result.steps ?? []) {
    for (const toolCall of step.toolCalls ?? []) {
      const toolResult = step.toolResults?.find((r) => r.toolCallId === toolCall.toolCallId);
      toolCallsLog.push({
        name: toolCall.toolName,
        args: "input" in toolCall ? toolCall.input : {},
        result: toolResult && "output" in toolResult ? toolResult.output : null,
      });
    }
  }

  return {
    reply,
    toolCalls: toolCallsLog,
  };
}
