/**
 * Agent Loop — explicit tool-call loop with steer/followUp capabilities.
 *
 * Inspired by Pi SDK's message delivery model:
 * - steer(): inject a message between tool-call rounds (mid-loop course correction)
 * - followUp(): queue a message delivered after the current loop completes
 *
 * Uses generateText with maxSteps=1 per round for explicit loop control.
 * Reuses existing safety mechanisms: IterationBudget, ForceAnswerDetector, LoopBreaker.
 */

import { generateText, stepCountIs } from "ai";
import type { ModelMessage, Tool } from "ai";
import { configManager } from "../../../config/config-manager.js";
import { getModelGateway } from "../../../gateways/model/gateway.js";
import { logError } from "../../../shared/errors.js";
import type { AgentRunEvent } from "../domain/agent-run.js";
import {
  IterationBudget,
  ForceAnswerDetector,
  LoopBreaker,
  injectBudgetWarning,
  injectLoopBreakerWarning,
  guardEmptyResponse,
  logCacheStats,
} from "./conversation.js";

// ---- Message Queue ----

export type DeliveryMode = "steer" | "followUp";

interface MessageEntry {
  content: string;
  mode: DeliveryMode;
  resolve: () => void;
}

/**
 * Priority message queue for agent loop interruption.
 *
 * - steer messages: injected between tool-call rounds (before next LLM call)
 *   The content is added to the message history as a user turn.
 * - followUp messages: queued until the current loop completes.
 *   The promise resolves when the loop ends, signaling the caller can proceed
 *   with the content in a new turn. The content is NOT consumed by the loop itself.
 *
 * Callbacks notify the caller when messages are enqueued,
 * enabling the loop to react immediately to steer messages.
 */
export class MessageQueue {
  private steerQueue: MessageEntry[] = [];
  private followUpQueue: MessageEntry[] = [];
  private onEnqueueCallback?: (mode: DeliveryMode) => void;

  /** Register a callback for new message events */
  onEnqueue(callback: (mode: DeliveryMode) => void): void {
    this.onEnqueueCallback = callback;
  }

  /**
   * Queue a message for delivery.
   * Returns a promise that resolves when the message is consumed by the loop.
   */
  enqueue(content: string, mode: DeliveryMode): Promise<void> {
    return new Promise<void>((resolve) => {
      const entry: MessageEntry = { content, mode, resolve };
      if (mode === "steer") {
        this.steerQueue.push(entry);
      } else {
        this.followUpQueue.push(entry);
      }
      this.onEnqueueCallback?.(mode);
    });
  }

  /** Check if any messages are pending */
  get pending(): boolean {
    return this.steerQueue.length > 0 || this.followUpQueue.length > 0;
  }

  /** Check specifically for steer messages */
  get hasSteer(): boolean {
    return this.steerQueue.length > 0;
  }

  /** Drain all entries of a given mode, resolving their promises */
  drain(mode: DeliveryMode): MessageEntry[] {
    const queue = mode === "steer" ? this.steerQueue : this.followUpQueue;
    const entries = [...queue];
    queue.length = 0;
    return entries;
  }
}

// ---- Agent Loop ----

export interface AgentLoopConfig {
  conversationId: string;
  messages: ModelMessage[];
  system: string;
  tools: Record<string, Tool>;
  queue: MessageQueue;
  abortSignal?: AbortSignal;
  maxRounds?: number;
  runtimeContext?: { runId?: string; projectId?: string; mode?: string };
  onTextDelta?: (text: string) => void | Promise<void>;
  onToolEvent?: (event: { type: "tool-call" | "tool-result"; name: string; toolCallId: string; args?: unknown; result?: unknown }) => void | Promise<void>;
}

/**
 * Explicit agent loop with steer/followUp support.
 *
 * Each round calls generateText(maxSteps=1) — the SDK handles one LLM call
 * plus tool execution per round. Between rounds, the loop checks the message
 * queue for steer injections and accumulates followUp messages for the next turn.
 *
 * Safety: reuses IterationBudget, ForceAnswerDetector, LoopBreaker from conversation.ts.
 */
export async function* runAgentLoop(
  config: AgentLoopConfig,
): AsyncGenerator<AgentRunEvent> {
  const {
    conversationId,
    messages: initialMessages,
    system,
    tools,
    queue,
    abortSignal,
    onTextDelta,
    onToolEvent,
  } = config;

  const maxRounds = config.maxRounds ?? configManager.getMaxSteps();
  const model = getModelGateway().getModel(
    configManager.getActiveModel() || "mimo-2.5-pro",
  );

  // Safety mechanisms (reuse from conversation.ts)
  const budget = new IterationBudget(maxRounds);
  const forceDetector = new ForceAnswerDetector();
  const loopBreaker = new LoopBreaker();

  // Working state
  const messages = [...initialMessages];
  const toolCallsLog: { toolCallId: string; name: string; args: unknown; result: unknown }[] = [];
  let accumulatedText = "";
  let loopDetected = false;

  // ---- Helpers ----

  const saveAssistantMessage = async (
    reply: string,
    log: { toolCallId: string; name: string; args: unknown; result: unknown }[],
  ): Promise<void> => {
    try {
      const { getRepositories } = await import("../../../persistence/factory.js");
      const repo = getRepositories().conversations;
      await repo.addMessage(conversationId, {
        role: "assistant",
        content: reply,
        toolCalls: log.length > 0 ? JSON.stringify(log) : undefined,
      });
    } catch (err) {
      logError("AgentLoop/saveAssistantMessage", err);
    }
  };

  // ---- Main Loop ----

  let abortedDuringLoop = false;

  for (let round = 0; round < maxRounds; round++) {
    if (abortSignal?.aborted) {
      abortedDuringLoop = true;
      break;
    }

    // Check for steer messages before each round
    const steerEntries = queue.drain("steer");
    if (steerEntries.length > 0) {
      // Inject steer messages as user turns
      for (const entry of steerEntries) {
        messages.push({ role: "user", content: `[用户插入] ${entry.content}` });
        entry.resolve();
      }
      yield { type: "delta", text: "" }; // signal steer consumed
    }

    // Call LLM — SDK executes tools automatically with maxSteps=1
    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await generateText({
        model,
        system,
        messages,
        tools,
        stopWhen: stepCountIs(1),
        abortSignal,
      });
    } catch (err) {
      logError("AgentLoop/generateText", err);
      throw err;
    }

    logCacheStats(
      result.providerMetadata as Record<string, unknown> | undefined,
      "AgentLoop",
    );

    // Extract text and tool calls from the step
    const stepText = result.text ?? "";
    const stepToolCalls = result.toolCalls ?? [];
    const stepToolResults = result.toolResults ?? [];

    // Emit text delta (only the new portion)
    if (stepText) {
      const newDelta = stepText.slice(accumulatedText.length);
      if (newDelta) {
        accumulatedText = stepText;
        if (onTextDelta) await onTextDelta(newDelta);
        yield { type: "delta", text: newDelta };
      }
    }

    // Record step for force answer detection
    const shouldForceAnswer = forceDetector.recordStep({
      text: stepText,
      toolCalls: stepToolCalls,
    });

    if (shouldForceAnswer) {
      console.info(
        "[AgentLoop] ForceAnswer triggered — generating text-only response",
      );
      try {
        const forced = await generateText({
          model,
          system,
          messages: [
            ...messages,
            { role: "assistant", content: "" },
            {
              role: "user",
              content:
                "[系统提示] 你已连续调用工具3轮未生成文本。请基于已获取的信息直接回答用户问题，不要再调用工具。",
            },
          ],
        });
        const forcedText = guardEmptyResponse(
          forced as { text: string; reasoning?: string | { text: string }[] },
        );
        if (forcedText) {
          accumulatedText = forcedText;
          if (onTextDelta) await onTextDelta(forcedText);
          yield { type: "delta", text: forcedText };
        }
        await saveAssistantMessage(forcedText, toolCallsLog);
        yield {
          type: "run_completed",
          result: { text: forcedText, conversationId },
        };
      } catch (err) {
        logError("AgentLoop/forceAnswer/generateText", err);
        await saveAssistantMessage(accumulatedText, toolCallsLog);
        yield {
          type: "run_failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      break;
    }

    // No tool calls → loop complete
    if (stepToolCalls.length === 0) {
      const finalText =
        accumulatedText ||
        guardEmptyResponse(
          result as { text: string; reasoning?: string | { text: string }[] },
        );
      await saveAssistantMessage(finalText, toolCallsLog);
      yield {
        type: "run_completed",
        result: { text: finalText, conversationId },
      };
      break;
    }

    // Has tool calls — emit events and add to message history
    for (const tc of stepToolCalls) {
      const callArgs = "input" in tc ? tc.input : {};
      toolCallsLog.push({
        toolCallId: tc.toolCallId,
        name: tc.toolName,
        args: callArgs,
        result: null,
      });
      if (onToolEvent) {
        await onToolEvent({
          type: "tool-call",
          name: tc.toolName,
          toolCallId: tc.toolCallId,
          args: callArgs,
        });
      }
      yield {
        type: "tool_call",
        toolCall: { id: tc.toolCallId, name: tc.toolName, args: callArgs },
      };
    }

    // Budget check
    if (budget.advance()) {
      console.info("[AgentLoop] budget threshold reached");
    }

    // Record tool results and emit events
    for (const tr of stepToolResults) {
      const output = "output" in tr ? tr.output : null;
      const entry = toolCallsLog.find(
        (e) => e.toolCallId === tr.toolCallId,
      );
      if (entry) entry.result = output;
      if (onToolEvent) {
        await onToolEvent({
          type: "tool-result",
          name: tr.toolName,
          toolCallId: tr.toolCallId,
          result: output,
        });
      }
      yield {
        type: "tool_call",
        toolCall: {
          id: tr.toolCallId,
          name: tr.toolName,
          args: null,
          result: output,
        },
      };
    }

    // Loop breaker detection
    for (const tc of stepToolCalls) {
      const flags = loopBreaker.recordToolCall(
        tc.toolName,
        "input" in tc ? tc.input : {},
      );
      if (flags.stuck || flags.excessive) {
        loopDetected = true;
        console.info(
          `[AgentLoop] loop detected: stuck=${flags.stuck} excessive=${flags.excessive}`,
        );
      }
    }

    // Add assistant message with tool calls to history
    messages.push({
      role: "assistant",
      content: stepToolCalls.map((tc) => ({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: "input" in tc ? tc.input : {},
      })),
    } as (typeof messages)[number]);

    // Build tool results for history, with warnings injected as needed
    let toolResultsForHistory: Array<{
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output: unknown;
    }> = stepToolResults.map((tr) => ({
      type: "tool-result" as const,
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      output: "output" in tr ? tr.output : null,
    }));

    if (budget.shouldWarn) {
      const raw = toolResultsForHistory.map((tr) => ({
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: tr.output,
      }));
      const warned = injectBudgetWarning(raw);
      toolResultsForHistory = warned.map((w, i) => ({
        ...toolResultsForHistory[i]!,
        output: w.output,
      }));
    }

    if (loopDetected) {
      const raw = toolResultsForHistory.map((tr) => ({
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: tr.output,
      }));
      const warned = injectLoopBreakerWarning(raw);
      toolResultsForHistory = warned.map((w, i) => ({
        ...toolResultsForHistory[i]!,
        output: w.output,
      }));
    }

    messages.push({
      role: "tool" as const,
      content: toolResultsForHistory,
    } as (typeof messages)[number]);

    // If loop detected, force a final text response and stop
    if (loopDetected) {
      console.info("[AgentLoop] loop detected, forcing final text response");
      try {
        const forced = await generateText({
          model,
          system,
          messages: [
            ...messages,
            { role: "assistant", content: "" },
            {
              role: "user",
              content:
                "[系统提示] 检测到工具调用循环。请停止调用工具，基于已有信息直接回答用户问题。",
            },
          ],
        });
        const forcedText = guardEmptyResponse(
          forced as { text: string; reasoning?: string | { text: string }[] },
        );
        if (forcedText) {
          accumulatedText = forcedText;
          if (onTextDelta) await onTextDelta(forcedText);
          yield { type: "delta", text: forcedText };
        }
        await saveAssistantMessage(forcedText, toolCallsLog);
        yield {
          type: "run_completed",
          result: { text: forcedText, conversationId },
        };
      } catch (err) {
        logError("AgentLoop/loopBreaker/forceText", err);
        await saveAssistantMessage(accumulatedText, toolCallsLog);
        yield {
          type: "run_failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      break;
    }

    // If this was the last allowed round, save and stop
    if (round === maxRounds - 1) {
      const finalText = accumulatedText || "(达到最大轮次限制)";
      await saveAssistantMessage(finalText, toolCallsLog);
      yield {
        type: "run_completed",
        result: { text: finalText, conversationId },
      };
    }
  }

  // Yield terminal event if loop was aborted mid-execution
  if (abortedDuringLoop) {
    if (accumulatedText) {
      await saveAssistantMessage(accumulatedText, toolCallsLog);
    }
    yield { type: "run_failed", error: "Aborted by user" };
  }

  // ---- Post-loop: process followUp messages ----
  const followUpEntries = queue.drain("followUp");
  if (followUpEntries.length > 0) {
    for (const entry of followUpEntries) {
      entry.resolve();
    }
  }
}
